// Everything lives in one SQLite file (Node's built-in node:sqlite, no extra package).
//   tasks        the task and its missing_labels list
//   task_labels  one row per label that was found (time, date or location)
//   actions      one row per input-box action: reply, trace id, cost, every model call

import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { LABELS, type LabelName, type Labels } from "./labels.ts";

mkdirSync("data", { recursive: true });
const db = new DatabaseSync("data/tasks.db");
db.exec("PRAGMA foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    description    TEXT NOT NULL,
    missing_labels TEXT NOT NULL DEFAULT '[]',  -- JSON array of label names not found
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS task_labels (
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    name    TEXT NOT NULL CHECK (name IN ('time', 'date', 'location')),
    value   TEXT NOT NULL,
    PRIMARY KEY (task_id, name)
  );
  CREATE TABLE IF NOT EXISTS actions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at    TEXT NOT NULL,
    input         TEXT NOT NULL,
    reply         TEXT NOT NULL,
    trace_id      TEXT NOT NULL,
    duration_ms   INTEGER NOT NULL,
    input_tokens  INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd      REAL NOT NULL,
    calls         TEXT NOT NULL,  -- JSON: CallRecord[]
    changes       TEXT NOT NULL   -- JSON: Change[]
  );
`);

export type Task = {
  id: number;
  ref: string; // "TSK-001"
  description: string;
  labels: Partial<Record<LabelName, string>>;
  missingLabels: LabelName[];
  createdAt: string;
  updatedAt: string;
};

export const taskRef = (id: number) => `TSK-${String(id).padStart(3, "0")}`;

/** Accepts 3, "3", "TSK-003" and "tsk-3". */
export function parseTaskId(value: string | number): number | null {
  const match = /^(?:tsk-)?(\d+)$/i.exec(String(value).trim());
  return match ? Number(match[1]) : null;
}

function writeLabels(taskId: number, labels: Labels) {
  db.prepare("DELETE FROM task_labels WHERE task_id = ?").run(taskId);
  for (const name of LABELS) {
    const value = labels[name];
    if (value !== null) db.prepare("INSERT INTO task_labels (task_id, name, value) VALUES (?, ?, ?)").run(taskId, name, value);
  }
  db.prepare("UPDATE tasks SET missing_labels = ? WHERE id = ?").run(JSON.stringify(labels.missing_labels), taskId);
}

export function createTask(description: string, labels: Labels): Task {
  const now = new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare("INSERT INTO tasks (description, created_at, updated_at) VALUES (?, ?, ?)")
    .run(description, now, now);
  const id = Number(lastInsertRowid);
  writeLabels(id, labels);
  return getTask(id)!;
}

export function updateTask(id: number, description: string, labels: Labels): Task {
  db.prepare("UPDATE tasks SET description = ?, updated_at = ? WHERE id = ?").run(description, new Date().toISOString(), id);
  writeLabels(id, labels);
  return getTask(id)!;
}

export function deleteTask(id: number): void {
  db.prepare("DELETE FROM tasks WHERE id = ?").run(id);
}

export function getTask(id: number): Task | undefined {
  const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  return row ? toTask(row) : undefined;
}

/** Most recently modified first. */
export function listTasks(): Task[] {
  return db.prepare("SELECT * FROM tasks ORDER BY updated_at DESC, id DESC").all().map(toTask);
}

/** Case-insensitive: exact matches if there are any, otherwise tasks containing the text. */
export function findByDescription(text: string): Task[] {
  const wanted = text.trim().toLowerCase();
  const all = listTasks();
  const exact = all.filter((task) => task.description.toLowerCase() === wanted);
  return exact.length ? exact : all.filter((task) => task.description.toLowerCase().includes(wanted));
}

function toTask(row: Record<string, unknown>): Task {
  const id = row.id as number;
  const labels: Task["labels"] = {};
  for (const label of db.prepare("SELECT name, value FROM task_labels WHERE task_id = ?").all(id)) {
    labels[label.name as LabelName] = label.value as string;
  }
  return {
    id,
    ref: taskRef(id),
    description: row.description as string,
    labels,
    missingLabels: JSON.parse(row.missing_labels as string),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export type CallRecord = {
  name: string; // "agent" or "labels"
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  priceKnown: boolean;
  note?: string; // set when the reply failed validation and why
  ms: number;
};

export type Change = { op: "created" | "updated" | "deleted"; ref: string; description: string };

export type Action = {
  id: number;
  createdAt: string;
  input: string;
  reply: string;
  traceId: string;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  calls: CallRecord[];
  changes: Change[];
};

export function saveAction(action: Omit<Action, "id" | "createdAt">): Action {
  const createdAt = new Date().toISOString();
  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO actions (created_at, input, reply, trace_id, duration_ms, input_tokens, output_tokens, cost_usd, calls, changes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      createdAt, action.input, action.reply, action.traceId, action.durationMs, action.inputTokens,
      action.outputTokens, action.costUsd, JSON.stringify(action.calls), JSON.stringify(action.changes),
    );
  return { ...action, id: Number(lastInsertRowid), createdAt };
}

export function lastAction(): Action | null {
  const row = db.prepare("SELECT * FROM actions ORDER BY id DESC LIMIT 1").get();
  if (!row) return null;
  return {
    id: row.id as number,
    createdAt: row.created_at as string,
    input: row.input as string,
    reply: row.reply as string,
    traceId: row.trace_id as string,
    durationMs: row.duration_ms as number,
    inputTokens: row.input_tokens as number,
    outputTokens: row.output_tokens as number,
    costUsd: row.cost_usd as number,
    calls: JSON.parse(row.calls as string),
    changes: JSON.parse(row.changes as string),
  };
}
