// npm run route "<prompt>"            route the prompt, then answer it
// npm run route -- --dry "<prompt>"   only show which model it would go to
//
// Needs the LiteLLM gateway running (see apps/README.md).

import { startLangfuse, stopLangfuse, langfuseEnabled } from "./langfuse.ts";
import { routePrompt } from "./pipeline.ts";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const prompt = args.filter((arg) => arg !== "--dry").join(" ");

if (!prompt) {
  console.error('Usage: npm run route [-- --dry] "<prompt>"');
  process.exit(1);
}
if (!process.env.LITELLM_MASTER_KEY) {
  console.error("LITELLM_MASTER_KEY is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

startLangfuse();

try {
  const ctx = await routePrompt(prompt, { dryRun });

  console.log(`Route:  ${ctx.complexity}, decided by ${ctx.decidedBy}: ${ctx.reason}`);
  if (dryRun) {
    console.log("Dry run: no answer requested.");
  } else {
    if (ctx.failedModels.length > 0) console.log(`Failed: ${ctx.failedModels.join("; ")}`);
    console.log(`Model:  ${ctx.model}`);
    console.log();
    console.log(ctx.answer || "(no text in response)");
    console.log();
    console.log(`Tokens: ${ctx.inputTokens ?? "?"} input + ${ctx.outputTokens ?? "?"} output`);
  }
  console.log(langfuseEnabled ? "Sent to Langfuse." : "Langfuse keys not set: no trace sent.");
} catch (error) {
  console.error("Request failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await stopLangfuse();
}
