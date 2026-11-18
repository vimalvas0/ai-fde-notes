// Express server: a small JSON API plus the React page.
// `npm run dev` serves the page through Vite in the same process; `npm start` serves the built page.

import express, { type ErrorRequestHandler } from "express";
import multer from "multer";
import { extname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractText, getDocumentProxy } from "unpdf";
import {
  MAX_INSTRUCTION_CHARS,
  MAX_JD_CHARS,
  MAX_RESUME_BYTES,
  RESUME_EXTENSIONS,
} from "../shared/limits.ts";
import { listRuns, saveRun } from "./db.ts";
import { startLangfuse } from "./langfuse.ts";
import { runPipeline } from "./pipeline.ts";

startLangfuse();

const MAX_RESUME_TEXT = 20_000; // characters sent to the model

class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

async function readResume(file: Express.Multer.File): Promise<string> {
  const extension = extname(file.originalname).toLowerCase();
  if (!RESUME_EXTENSIONS.includes(extension)) {
    throw new UserError(`Resume must be one of: ${RESUME_EXTENSIONS.join(", ")}`);
  }
  let text: string;
  if (extension === ".pdf") {
    try {
      const pdf = await getDocumentProxy(new Uint8Array(file.buffer));
      text = (await extractText(pdf, { mergePages: true })).text;
    } catch {
      throw new UserError("Could not read that PDF.", 422);
    }
  } else {
    text = file.buffer.toString("utf8");
  }
  text = text.trim();
  if (!text) throw new UserError("No text found in the resume (a scanned PDF has none).", 422);
  return text.slice(0, MAX_RESUME_TEXT);
}

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_RESUME_BYTES, files: 1 } });

app.get("/api/runs", (_req, res) => {
  res.json(listRuns());
});

app.post("/api/match", upload.single("resume"), async (req, res) => {
  if (!req.file) throw new UserError("Upload a resume.");
  const jd = String(req.body.jd ?? "").trim();
  const instruction = String(req.body.instruction ?? "").trim();
  if (!jd) throw new UserError("Paste a job description.");
  if (jd.length > MAX_JD_CHARS) throw new UserError(`Job description is over ${MAX_JD_CHARS} characters.`);
  if (instruction.length > MAX_INSTRUCTION_CHARS) throw new UserError(`Request is over ${MAX_INSTRUCTION_CHARS} characters.`);

  const resumeText = await readResume(req.file);
  const { result, steps } = await runPipeline({ resumeText, jd, instruction });
  res.json(saveRun({ resumeName: req.file.originalname, jd, instruction, result, steps }));
});

const onError: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    res.status(413).json({ error: `Resume is over ${MAX_RESUME_BYTES / 1024 / 1024} MB.` });
  } else if (error instanceof UserError) {
    res.status(error.status).json({ error: error.message });
  } else {
    console.error(error);
    res.status(500).json({ error: error instanceof Error ? error.message : "Something went wrong." });
  }
};

if (process.argv.includes("--prod")) {
  app.use(express.static(fileURLToPath(new URL("../dist", import.meta.url))));
} else {
  const { createServer } = await import("vite");
  app.use((await createServer({ server: { middlewareMode: true }, appType: "spa" })).middlewares);
}
app.use(onError);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`http://localhost:${port}`));
