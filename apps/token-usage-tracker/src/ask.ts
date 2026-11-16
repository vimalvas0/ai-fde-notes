// npm run ask <user> <prompt>
// Sends the prompt to OpenAI, then tracks the token usage in two places:
//   1. data/usage.jsonl  — our own store, read back by `npm run usage`
//   2. Langfuse          — a trace tagged with the user id, visible on the dashboard

import { observeOpenAI } from "@langfuse/openai";
import { getActiveTraceId, propagateAttributes, startActiveObservation } from "@langfuse/tracing";
import OpenAI from "openai";

import { langfuseEnabled, startLangfuse, stopLangfuse } from "./langfuse.ts";
import { getUsage, recordUsage, sumUsage } from "./store.ts";

const [user, ...promptWords] = process.argv.slice(2);
const prompt = promptWords.join(" ");

if (!user || !prompt) {
  console.error('Usage: npm run ask <user> "<prompt>"');
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";

startLangfuse();

// observeOpenAI wraps the client so every call becomes a Langfuse "generation"
// with its model, input, output and token usage attached.
const openai = langfuseEnabled ? observeOpenAI(new OpenAI()) : new OpenAI();

async function ask(): Promise<void> {
  const completion = await openai.chat.completions.create({
    model,
    messages: [{ role: "user", content: prompt }],
  });

  // Every response reports the tokens it was billed for. This is the source of truth.
  const usage = completion.usage;
  if (!usage) throw new Error("The response did not include usage data.");

  recordUsage({
    timestamp: new Date().toISOString(),
    user,
    model: completion.model,
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    requestId: completion.id,
    traceId: langfuseEnabled ? getActiveTraceId() : undefined,
  });

  console.log(completion.choices[0]?.message.content ?? "(no text in response)");
  console.log();
  console.log(`This request: ${usage.prompt_tokens} input + ${usage.completion_tokens} output = ${usage.total_tokens} tokens`);

  const totals = sumUsage(getUsage(user));
  console.log(`${user} so far:  ${totals.inputTokens} input + ${totals.outputTokens} output = ${totals.totalTokens} tokens over ${totals.requests} request(s)`);
}

try {
  if (langfuseEnabled) {
    // propagateAttributes puts the user id on the trace, which is what lets
    // Langfuse break token usage and cost down per user.
    await propagateAttributes({ userId: user, traceName: "ask" }, () =>
      startActiveObservation("ask", async (span) => {
        span.update({ input: prompt });
        await ask();
      }),
    );
    console.log("Sent to Langfuse.");
  } else {
    await ask();
    console.log("Langfuse keys not set — stored locally only.");
  }
} catch (error) {
  console.error("Request failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await stopLangfuse();
}
