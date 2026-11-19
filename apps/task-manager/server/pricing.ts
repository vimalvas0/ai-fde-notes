// USD per 1M tokens (input, output). Reasoning tokens are billed as output and already
// counted in the output figure. Cached-input discounts are ignored, so this slightly
// overstates cost. Check https://openai.com/api/pricing before trusting it for budgets.

const PRICES: Record<string, { input: number; output: number }> = {
  "gpt-5": { input: 1.25, output: 10 },
  "gpt-5-mini": { input: 0.25, output: 2 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-4.1": { input: 2, output: 8 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4 },
};

export function priceOf(model: string, inputTokens: number, outputTokens: number) {
  const price = PRICES[model];
  if (!price) return { input: 0, output: 0, total: 0, known: false };
  const input = (inputTokens * price.input) / 1_000_000;
  const output = (outputTokens * price.output) / 1_000_000;
  return { input, output, total: input + output, known: true };
}
