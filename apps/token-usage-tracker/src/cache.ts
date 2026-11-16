// Response cache for the `movies` command: one JSON file, keyed by a hash of
// (model, system prompt, normalised series name). When a second user asks for the
// same series, the stored answer is returned and no API call is made.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const FILE = join(import.meta.dirname, "..", "data", "movie-cache.json");

interface CacheEntry {
  answer: string;
  cachedAt: string;
  askedBy: string;
}

/** "  Breaking   BAD " and "breaking bad" are the same question. */
export function cacheKey(model: string, systemPrompt: string, name: string): string {
  const normalised = name.trim().replace(/\s+/g, " ").toLowerCase();
  return createHash("sha256").update(`${model}\n${systemPrompt}\n${normalised}`).digest("hex");
}

function load(): Record<string, CacheEntry> {
  return existsSync(FILE) ? (JSON.parse(readFileSync(FILE, "utf8")) as Record<string, CacheEntry>) : {};
}

export function getCached(key: string): CacheEntry | undefined {
  return load()[key];
}

export function setCached(key: string, entry: CacheEntry): void {
  const all = load();
  all[key] = entry;
  mkdirSync(dirname(FILE), { recursive: true });
  writeFileSync(FILE, JSON.stringify(all, null, 2));
}
