import { findSection } from "./documents.ts";
import type { Chunk, Doc, Question, ResolvedQuestion, Summary } from "./types.ts";

/** Look up the expected section of every question. Fails loudly if a heading is missing. */
export function resolveQuestions(questions: Question[], docs: Doc[]): ResolvedQuestion[] {
  return questions.map((q) => {
    const doc = docs.find((d) => d.source === q.source);
    const span = doc && findSection(doc.text, q.section);
    if (!span) throw new Error(`Section "${q.section}" not found in ${q.source}`);
    return { ...q, span };
  });
}

/**
 * A chunk is relevant when it is from the expected file and shares at least half of the
 * shorter of (chunk, section) with the expected section. Same rule for every strategy.
 */
export function isRelevant(chunk: Chunk, q: ResolvedQuestion): boolean {
  if (chunk.source !== q.source) return false;
  const shared = Math.min(q.span.end, chunk.charEnd) - Math.max(q.span.start, chunk.charStart);
  const shorter = Math.min(q.span.end - q.span.start, chunk.charEnd - chunk.charStart);
  return shared >= 0.5 * shorter;
}

/** 1-based rank of the first chunk that passes the test, or undefined. */
export function firstRank(results: Chunk[], test: (c: Chunk) => boolean): number | undefined {
  const i = results.findIndex(test);
  return i === -1 ? undefined : i + 1;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function summarize(
  name: string,
  chunks: Chunk[],
  ranks: (number | undefined)[],
  sourceRanks: (number | undefined)[],
): Summary {
  const hitAt = (rs: (number | undefined)[], k: number) => mean(rs.map((r) => (r !== undefined && r <= k ? 1 : 0)));
  return {
    name,
    chunks: chunks.length,
    avgChars: Math.round(mean(chunks.map((c) => c.text.length))),
    hit1: hitAt(ranks, 1),
    hit3: hitAt(ranks, 3),
    hit5: hitAt(ranks, 5),
    mrr: mean(ranks.map((r) => (r ? 1 / r : 0))),
    sourceHit1: hitAt(sourceRanks, 1),
  };
}
