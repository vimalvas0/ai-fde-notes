// Local usage store: one JSON object per line in data/usage.jsonl.
// This is the "programmatic" side — your own record of who used how many tokens.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const FILE = join(import.meta.dirname, "..", "data", "usage.jsonl");

export interface UsageRecord {
  timestamp: string;
  user: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Part of inputTokens that was served from the provider's prompt cache. */
  cachedInputTokens: number;
  /** Part of outputTokens the model spent on hidden reasoning. */
  reasoningTokens: number;
  /** OpenAI's id for the request. */
  requestId: string;
  /** Langfuse trace id, when Langfuse is configured. */
  traceId?: string;
}

export interface UsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export function recordUsage(record: UsageRecord): void {
  mkdirSync(dirname(FILE), { recursive: true });
  appendFileSync(FILE, JSON.stringify(record) + "\n");
}

/** All stored records, optionally for one user only. */
export function getUsage(user?: string): UsageRecord[] {
  if (!existsSync(FILE)) return [];
  const records = readFileSync(FILE, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as UsageRecord);
  return user ? records.filter((r) => r.user === user) : records;
}

export function sumUsage(records: UsageRecord[]): UsageTotals {
  const totals: UsageTotals = { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  for (const r of records) {
    totals.requests += 1;
    totals.inputTokens += r.inputTokens;
    totals.outputTokens += r.outputTokens;
    totals.totalTokens += r.totalTokens;
  }
  return totals;
}

/** Totals per user, e.g. { alice: { requests: 3, inputTokens: 120, ... } }. */
export function getUsageByUser(): Record<string, UsageTotals> {
  const byUser: Record<string, UsageRecord[]> = {};
  for (const r of getUsage()) (byUser[r.user] ??= []).push(r);
  return Object.fromEntries(Object.entries(byUser).map(([user, records]) => [user, sumUsage(records)]));
}
