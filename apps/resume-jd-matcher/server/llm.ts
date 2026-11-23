// One function to call a model: providers are tried in order (default OpenAI, then Anthropic;
// set LLM_PROVIDERS to change it, e.g. "gemini" to use only Gemini). Each attempt is its own Langfuse generation, so a failed OpenAI call and the
// Anthropic call that replaced it both show up in the trace.

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { Step } from "./db.ts";
import { observe } from "./langfuse.ts";

export type Tier = "fast" | "strong"; // fast = cheap model for easy steps, strong = for the hard one

const MODELS = {
  openai: {
    fast: process.env.OPENAI_FAST_MODEL ?? "gpt-5-mini",
    strong: process.env.OPENAI_STRONG_MODEL ?? "gpt-5",
  },
  anthropic: {
    fast: process.env.ANTHROPIC_FAST_MODEL ?? "claude-haiku-5-5",
    strong: process.env.ANTHROPIC_STRONG_MODEL ?? "claude-sonnet-5-5",
  },
  gemini: {
    fast: process.env.GEMINI_FAST_MODEL ?? "gemini-3.5-flash-lite",
    strong: process.env.GEMINI_STRONG_MODEL ?? "gemini-3.5-flash",
  },
};

const clientOptions = { timeout: 60_000, maxRetries: 1 };
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "missing", ...clientOptions });
// Gemini speaks the OpenAI chat API on this base URL, so it reuses the OpenAI client class and call.
const gemini = new OpenAI({
  apiKey: process.env.GEMINI_API_KEY || "missing",
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  ...clientOptions,
});
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_KEY || "missing",
  ...clientOptions,
});

type Usage = { input: number; output: number };
type Reply = { text: string; usage: Usage };

async function callOpenAI(model: string, system: string, user: string): Promise<Reply> {
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return {
    text: completion.choices[0]?.message.content ?? "",
    usage: { input: completion.usage?.prompt_tokens ?? 0, output: completion.usage?.completion_tokens ?? 0 },
  };
}

async function callGemini(model: string, system: string, user: string): Promise<Reply> {
  const completion = await gemini.chat.completions.create({
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return {
    text: completion.choices[0]?.message.content ?? "",
    usage: { input: completion.usage?.prompt_tokens ?? 0, output: completion.usage?.completion_tokens ?? 0 },
  };
}

async function callAnthropic(model: string, system: string, user: string): Promise<Reply> {
  const message = await anthropic.messages.create({
    model,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: user }],
  });
  return {
    text: message.content.map((block) => (block.type === "text" ? block.text : "")).join(""),
    usage: { input: message.usage.input_tokens, output: message.usage.output_tokens },
  };
}

export async function generate(
  step: string,
  tier: Tier,
  system: string,
  user: string,
): Promise<{ text: string; step: Step }> {
  const available = {
    openai: { provider: "openai", call: callOpenAI },
    anthropic: { provider: "anthropic", call: callAnthropic },
    gemini: { provider: "gemini", call: callGemini },
  } as const;
  const order = (process.env.LLM_PROVIDERS ?? "openai,anthropic")
    .split(",")
    .map((name) => name.trim())
    .filter((name): name is keyof typeof available => name in available);
  const attempts = order.map((name) => available[name]);
  const errors: string[] = [];

  for (const [index, { provider, call }] of attempts.entries()) {
    const model = MODELS[provider][tier];
    const started = Date.now();
    try {
      const text = await observe(`${step}:${provider}`, "generation", [{ role: "system", content: system }, { role: "user", content: user }], async (update) => {
        update({ model });
        const reply = await call(model, system, user);
        if (!reply.text.trim()) throw new Error("empty reply");
        update({ output: reply.text, usageDetails: { input: reply.usage.input, output: reply.usage.output } });
        return reply.text.trim();
      });
      return { text, step: { step, provider, model, ms: Date.now() - started, fellBack: index > 0 } };
    } catch (error) {
      errors.push(`${provider}: ${error instanceof Error ? error.message : error}`);
    }
  }
  throw new Error(`All providers failed for "${step}" (${errors.join("; ")})`);
}
