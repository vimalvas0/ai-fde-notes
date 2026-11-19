// Express server: a small JSON API plus the React page.
// `npm run dev` serves the page through Vite in the same process; `npm start` serves the built page.

import express, { type ErrorRequestHandler } from "express";
import { fileURLToPath } from "node:url";
import { handleInput, MAX_INPUT_CHARS } from "./agent.ts";
import { lastAction, listTasks, taskHistory } from "./db.ts";
import { startLangfuse } from "./langfuse.ts";

startLangfuse();

class UserError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const app = express();
app.use(express.json({ limit: "20kb" }));

// Tasks, most recently modified first.
app.get("/api/tasks", (_req, res) => {
  res.json(listTasks());
});

// What each input action did to one task: intent detected, labels fetched. Newest first.
app.get("/api/tasks/:ref/history", (req, res) => {
  const ref = String(req.params.ref).toUpperCase();
  if (!/^TSK-\d{3,}$/.test(ref)) throw new UserError("Task ids look like TSK-001.");
  res.json(taskHistory(ref));
});

// Cost and calls of the most recent input action (null before the first one).
app.get("/api/logs/last", (_req, res) => {
  res.json(lastAction());
});

// The input box. Runs the agent (tool calls, labelling) and returns the action with its cost.
let busy = false;
app.post("/api/act", async (req, res) => {
  const input = String(req.body?.input ?? "").trim();
  if (!input) throw new UserError("Type what you want to do.");
  if (input.length > MAX_INPUT_CHARS) throw new UserError(`Keep it under ${MAX_INPUT_CHARS} characters.`);
  if (!process.env.OPENAI_API_KEY) throw new UserError("OPENAI_API_KEY is not set. Add it to .env and restart.", 500);
  if (busy) throw new UserError("Another action is still running.", 429);

  busy = true; // one at a time, so the task list the model sees cannot change under it
  try {
    res.json({ action: await handleInput(input, String(req.body?.timeZone ?? "UTC")), tasks: listTasks() });
  } finally {
    busy = false;
  }
});

const onError: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof UserError) {
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
