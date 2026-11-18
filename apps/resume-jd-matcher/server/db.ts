// History lives in one SQLite file (Node's built-in node:sqlite, no extra package).

import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

mkdirSync("data", { recursive: true });
const db = new DatabaseSync("data/history.db");

db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    resume_name TEXT NOT NULL,
    jd          TEXT NOT NULL,
    instruction TEXT NOT NULL,
    result      TEXT NOT NULL,
    steps       TEXT NOT NULL  -- JSON: one entry per pipeline step
  )
`);

export type Step = {
  step: string;
  provider: "openai" | "anthropic";
  model: string;
  ms: number;
  fellBack: boolean; // true when OpenAI failed and Anthropic answered
};

export type Run = {
  id: number;
  createdAt: string; // UTC
  resumeName: string;
  jd: string;
  instruction: string;
  result: string;
  steps: Step[];
};

export function saveRun(run: Omit<Run, "id" | "createdAt">): Run {
  const { lastInsertRowid } = db
    .prepare("INSERT INTO runs (resume_name, jd, instruction, result, steps) VALUES (?, ?, ?, ?, ?)")
    .run(run.resumeName, run.jd, run.instruction, run.result, JSON.stringify(run.steps));
  return getRun(Number(lastInsertRowid));
}

function getRun(id: number): Run {
  return toRun(db.prepare("SELECT * FROM runs WHERE id = ?").get(id));
}

export function listRuns(limit = 50): Run[] {
  return db.prepare("SELECT * FROM runs ORDER BY id DESC LIMIT ?").all(limit).map(toRun);
}

function toRun(row: Record<string, unknown> | undefined): Run {
  if (!row) throw new Error("Run not found");
  return {
    id: row.id as number,
    createdAt: row.created_at as string,
    resumeName: row.resume_name as string,
    jd: row.jd as string,
    instruction: row.instruction as string,
    result: row.result as string,
    steps: JSON.parse(row.steps as string),
  };
}
