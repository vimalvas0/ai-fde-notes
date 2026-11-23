// promptfoo custom provider: runs the app's real intent step, then (for create cases) the label
// step, on the user's sentence. promptfoo hands us the rendered prompt, which is just {{input}}.
// The output is the object the assertions in asserts.ts grade: { intent, labels? }.

import { detectIntent } from "../server/intent.ts";
import { extractLabels } from "../server/labels.ts";
import { MODELS, type ActionContext } from "../server/llm.ts";

// Fixed clock, so "tomorrow" always means the same day and expected dates never go stale.
export const NOW = "Wednesday 2026-11-18 10:00 (Asia/Kolkata)";

export default class TaskManagerProvider {
  id() {
    return `task-manager:intent=${MODELS.intent},label=${MODELS.label}`;
  }

  async callApi(prompt: string, context?: { vars?: Record<string, unknown> }) {
    const ctx: ActionContext = { calls: [] };
    try {
      const intent = await detectIntent(ctx, prompt, NOW);
      const output: Record<string, unknown> = { intent };
      if (context?.vars?.withLabels) output.labels = (await extractLabels(ctx, prompt, NOW)).labels;
      const tokens = ctx.calls.reduce(
        (sum, call) => ({ prompt: sum.prompt + call.inputTokens, completion: sum.completion + call.outputTokens }),
        { prompt: 0, completion: 0 },
      );
      return {
        output,
        cost: ctx.calls.reduce((sum, call) => sum + call.costUsd, 0),
        tokenUsage: { ...tokens, total: tokens.prompt + tokens.completion },
      };
    } catch (err) {
      return { error: String(err) };
    }
  }
}
