// Price list and cost calculation. Prices are USD per 1M tokens and are typed in by
// hand, so check them against https://platform.openai.com/docs/pricing and edit here.
// Cost is worked out when you ask for it (not stored), so fixing a price fixes history.

import type { UsageRecord } from "./store.ts";

interface Price {
  input: number;
  /** Rate for the part of the input served from OpenAI's prompt cache. */
  cachedInput: number;
  output: number;
}

// Matched by longest prefix, because responses report dated names like "gpt-5-mini-2025-08-07".
const PRICES: Record<string, Price> = {
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10.0 },
};

function findPrice(model: string): Price | undefined {
  const match = Object.keys(PRICES)
    .filter((name) => model.startsWith(name))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PRICES[match] : undefined;
}

/** Cost of one request in USD, or undefined when the model is not in the price list. */
export function costOf(record: UsageRecord): number | undefined {
  const price = findPrice(record.model);
  if (!price) return undefined;
  const uncachedInput = record.inputTokens - record.cachedInputTokens;
  // Reasoning tokens are already part of outputTokens, so they are not added again.
  return (uncachedInput * price.input + record.cachedInputTokens * price.cachedInput + record.outputTokens * price.output) / 1_000_000;
}

export interface CostSummary {
  requests: number;
  /** Answered from our own response cache: no API call, no cost. */
  cacheHits: number;
  costUsd: number;
  /** Requests whose model has no price, so they are missing from costUsd. */
  unpricedRequests: number;
}

export function summariseCost(records: UsageRecord[]): CostSummary {
  const summary: CostSummary = { requests: 0, cacheHits: 0, costUsd: 0, unpricedRequests: 0 };
  for (const r of records) {
    summary.requests += 1;
    if (r.fromCache) summary.cacheHits += 1;
    const cost = costOf(r);
    if (cost === undefined) summary.unpricedRequests += 1;
    else summary.costUsd += cost;
  }
  return summary;
}
