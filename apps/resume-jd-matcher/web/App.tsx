import { useEffect, useState, type FormEvent } from "react";
import {
  MAX_INSTRUCTION_CHARS,
  MAX_JD_CHARS,
  MAX_RESULT_CHARS,
  MAX_RESUME_BYTES,
  RESUME_EXTENSIONS,
} from "../shared/limits.ts";

type Step = { step: string; provider: string; model: string; ms: number; fellBack: boolean };
type Run = {
  id: number;
  createdAt: string;
  resumeName: string;
  jd: string;
  instruction: string;
  result: string;
  steps: Step[];
};

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

function Pipeline({ steps }: { steps: Step[] }) {
  return (
    <p className="meta">
      {steps.map((s) => (
        <span key={s.step}>
          {s.step} · {s.model} · {(s.ms / 1000).toFixed(1)}s{s.fellBack ? " · fallback" : ""}
        </span>
      ))}
    </p>
  );
}

export function App() {
  const [file, setFile] = useState<File | null>(null);
  const [jd, setJd] = useState("");
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [latest, setLatest] = useState<Run | null>(null);
  const [history, setHistory] = useState<Run[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    api<Run[]>("/api/runs").then(setHistory).catch((e) => setError(e.message));
  }, []);

  function pickFile(picked: File | null) {
    setError("");
    if (picked && picked.size > MAX_RESUME_BYTES) {
      setFile(null);
      setError(`Resume is over ${MAX_RESUME_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setFile(picked);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    setLatest(null);
    try {
      const body = new FormData();
      body.append("resume", file);
      body.append("jd", jd);
      body.append("instruction", instruction);
      const run = await api<Run>("/api/match", { method: "POST", body });
      setLatest(run);
      setHistory((h) => [run, ...h]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const ready = file && jd.trim() && !busy;

  return (
    <main>
      <h1>Resume matcher</h1>
      <p className="lead">Upload a resume, paste a job description, and get a short verdict.</p>

      <form onSubmit={submit}>
        <label>
          Resume <span className="hint">{RESUME_EXTENSIONS.join(" ")} · max {MAX_RESUME_BYTES / 1024 / 1024} MB</span>
          <input type="file" accept={RESUME_EXTENSIONS.join(",")} onChange={(e) => pickFile(e.target.files?.[0] ?? null)} />
        </label>

        <label>
          Job description
          <textarea rows={8} maxLength={MAX_JD_CHARS} value={jd} onChange={(e) => setJd(e.target.value)} placeholder="Paste the job description" />
          <span className="hint right">{jd.length} / {MAX_JD_CHARS}</span>
        </label>

        <label>
          What do you want to know? <span className="hint">optional</span>
          <input
            type="text"
            maxLength={MAX_INSTRUCTION_CHARS}
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="e.g. Am I a fit for the backend side only?"
          />
        </label>

        <button type="submit" disabled={!ready}>{busy ? "Running the pipeline…" : "Run match"}</button>
      </form>

      {error && <p className="error">{error}</p>}

      {latest && (
        <section className="card">
          <p className="result">{latest.result}</p>
          <p className="hint right">{latest.result.length} / {MAX_RESULT_CHARS}</p>
          <Pipeline steps={latest.steps} />
        </section>
      )}

      <h2>History</h2>
      {history.length === 0 && <p className="hint">Nothing yet.</p>}
      <ul className="history">
        {history.map((run) => (
          <li key={run.id}>
            <button type="button" className="row" onClick={() => setOpenId(openId === run.id ? null : run.id)}>
              <span>{run.resumeName}</span>
              <span className="hint">{new Date(run.createdAt.replace(" ", "T") + "Z").toLocaleString()}</span>
            </button>
            {openId === run.id && (
              <div className="detail">
                <p className="result">{run.result}</p>
                {run.instruction && <p className="hint">Request: {run.instruction}</p>}
                <p className="hint">JD: {run.jd.slice(0, 160)}{run.jd.length > 160 ? "…" : ""}</p>
                <Pipeline steps={run.steps} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
