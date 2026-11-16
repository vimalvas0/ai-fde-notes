// The routing pipeline. A prompt goes through a list of stages, each of which
// reads and adds to a shared Context:
//
//   classify ──► answer
//   small, fast   chosen model (with fallback)
//   model judges
//   the prompt
//
// A stage is skipped when it does not apply (the answer stage on a dry run). Every
// stage that runs becomes a span in Langfuse, so one trace shows the whole route.
// All model calls go through the LiteLLM gateway, so a model is just a name.

import { observeOpenAI } from "@langfuse/openai";
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing";
import OpenAI from "openai";

import { langfuseEnabled } from "./langfuse.ts";
import { CLASSIFIER_MODEL, ROUTES, type Complexity } from "./models.ts";

export type Context = {
  prompt: string;
  /** Decide the route but do not call the answering model. */
  dryRun: boolean;
  complexity?: Complexity;
  reason?: string;
  model?: string;
  /** Models that failed before one worked. */
  failedModels: string[];
  answer?: string;
  inputTokens?: number;
  outputTokens?: number;
};

type Stage = {
  name: string;
  applies: (ctx: Context) => boolean;
  run: (ctx: Context) => Promise<void>;
};

const baseClient = new OpenAI({
  baseURL: process.env.LITELLM_BASE_URL ?? "http://localhost:4000/v1",
  apiKey: process.env.LITELLM_MASTER_KEY ?? "",
});
// observeOpenAI turns every call into a Langfuse generation under the current span.
const client = langfuseEnabled ? observeOpenAI(baseClient) : baseClient;

// Cap on answer length. Keeps cost bounded; raise it if answers get cut off.
const MAX_ANSWER_TOKENS = 2000;

// ---- Stage 1: classify ------------------------------------------------------
// A small, fast model reads the prompt and answers one word. This replaces
// hand-written word and length checks, which misjudge prompts that are short but
// hard, or long but easy. It costs one tiny call per prompt.

const CLASSIFIER_PROMPT =
  "You sort questions by how hard they are to answer well. " +
  "Reply with exactly one word: 'simple' for facts, definitions, short rewrites and casual chat; " +
  "'complex' for multi-step reasoning, code, analysis or long-form writing.";

const classifyStage: Stage = {
  name: "classify",
  applies: () => true,
  async run(ctx) {
    try {
      const completion = await client.chat.completions.create({
        model: CLASSIFIER_MODEL,
        max_completion_tokens: 10,
        messages: [
          { role: "system", content: CLASSIFIER_PROMPT },
          { role: "user", content: ctx.prompt },
        ],
      });
      const verdict = completion.choices[0]?.message.content?.trim().toLowerCase() ?? "";
      if (verdict.startsWith("simple")) settle(ctx, "simple", `${CLASSIFIER_MODEL} said simple`);
      else settle(ctx, "complex", `${CLASSIFIER_MODEL} said ${verdict || "nothing"}, treated as complex`);
    } catch (error) {
      // If we cannot tell, take the safe side: the stronger model.
      settle(ctx, "complex", `classifier failed (${messageOf(error)}), treated as complex`);
    }
  },
};

// ---- Stage 2: answer --------------------------------------------------------
// Call the chosen tier's models in order until one works.

const answerStage: Stage = {
  name: "answer",
  applies: (ctx) => !ctx.dryRun,
  async run(ctx) {
    const candidates = ROUTES[ctx.complexity ?? "complex"];
    for (const model of candidates) {
      try {
        const completion = await client.chat.completions.create({
          model,
          max_completion_tokens: MAX_ANSWER_TOKENS,
          messages: [{ role: "user", content: ctx.prompt }],
        });
        ctx.model = model;
        ctx.answer = completion.choices[0]?.message.content ?? "";
        ctx.inputTokens = completion.usage?.prompt_tokens;
        ctx.outputTokens = completion.usage?.completion_tokens;
        return;
      } catch (error) {
        ctx.failedModels.push(`${model} (${messageOf(error)})`);
      }
    }
    throw new Error(`Every model failed: ${ctx.failedModels.join("; ")}`);
  },
};

const STAGES: Stage[] = [classifyStage, answerStage];

// ---- Running it -------------------------------------------------------------

/** Run one prompt through the pipeline. The whole run is one Langfuse trace. */
export async function routePrompt(prompt: string, options: { dryRun?: boolean } = {}): Promise<Context> {
  const ctx: Context = { prompt, dryRun: options.dryRun ?? false, failedModels: [] };

  const runAll = async (root?: Span): Promise<void> => {
    root?.update({ input: prompt });
    for (const stage of STAGES) {
      if (!stage.applies(ctx)) continue;
      await traced(stage.name, () => stage.run(ctx), () => summary(ctx));
    }
    root?.update({
      output: ctx.answer ?? "(dry run: no answer requested)",
      metadata: { complexity: ctx.complexity, reason: ctx.reason, model: ctx.model, failedModels: ctx.failedModels },
    });
  };

  if (langfuseEnabled) {
    await propagateAttributes({ traceName: "model-router" }, () => startActiveObservation("model-router", runAll));
  } else {
    await runAll();
  }
  return ctx;
}

type Span = { update: (attrs: { input?: unknown; output?: unknown; metadata?: Record<string, unknown> }) => unknown };

/** Wrap a stage in a Langfuse span; plain call when Langfuse is off. */
async function traced(name: string, work: () => Promise<void>, describe: () => Record<string, unknown>): Promise<void> {
  if (!langfuseEnabled) return work();
  await startActiveObservation(name, async (span) => {
    await work();
    span.update({ output: describe() });
  });
}

function settle(ctx: Context, complexity: Complexity, reason: string): void {
  ctx.complexity = complexity;
  ctx.reason = reason;
}

function summary(ctx: Context): Record<string, unknown> {
  return { complexity: ctx.complexity, reason: ctx.reason, model: ctx.model };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
