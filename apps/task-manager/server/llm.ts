// One function for every model call. Each call is a Langfuse generation (nested under the
// action's root span) and is also recorded in ctx.calls, which feeds the Logs panel.

import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";
import type { CallRecord } from "./db.ts";
import { observe } from "./langfuse.ts";
import { priceOf } from "./pricing.ts";

export const MODELS = {
  agent: process.env.AGENT_MODEL ?? "gpt-5-mini", // reads the sentence, picks the tool
  label: process.env.LABEL_MODEL ?? "gpt-5-nano", // smaller model, one narrow job: extract labels
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "missing", timeout: 60_000, maxRetries: 1 });

/** Everything one input action collects as it runs. */
export type ActionContext = { calls: CallRecord[] };

type Params = Omit<ChatCompletionCreateParamsNonStreaming, "stream"> & { effort?: "minimal" | "low" };

export async function chat(ctx: ActionContext, name: string, { effort, ...params }: Params) {
  const started = Date.now();
  return observe(name, "generation", params.messages, async (update) => {
    update({ model: params.model });
    // gpt-5 models reason before answering; keep that short for these easy jobs.
    const reasoning = effort && params.model.startsWith("gpt-5") ? { reasoning_effort: effort } : {};
    const completion = await openai.chat.completions.create({ ...params, ...reasoning } as ChatCompletionCreateParamsNonStreaming);
    const message = completion.choices[0]?.message;
    if (!message) throw new Error("empty reply from model");

    const inputTokens = completion.usage?.prompt_tokens ?? 0;
    const outputTokens = completion.usage?.completion_tokens ?? 0;
    const price = priceOf(params.model, inputTokens, outputTokens);
    update({
      output: message,
      usageDetails: { input: inputTokens, output: outputTokens },
      costDetails: { input: price.input, output: price.output, total: price.total },
    });
    ctx.calls.push({
      name, model: params.model, inputTokens, outputTokens,
      costUsd: price.total, priceKnown: price.known, ms: Date.now() - started,
    });
    return message;
  });
}
