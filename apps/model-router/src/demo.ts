// npm run demo
// Routes a few sample prompts without answering them, so you can see how each
// one is sorted. Cheap: each prompt makes one tiny call to the small classifier model.

import { startLangfuse, stopLangfuse } from "./langfuse.ts";
import { routePrompt } from "./pipeline.ts";
import { ROUTES } from "./models.ts";

const SAMPLES = [
  "What is the capital of France?",
  "Write a function that merges two sorted lists and explain its complexity.",
  "Give me a friendly two-line message to thank a colleague for helping me today with the report.",
  "Compare REST and GraphQL for a mobile app and recommend one.",
];

if (!process.env.LITELLM_MASTER_KEY) {
  console.error("LITELLM_MASTER_KEY is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

startLangfuse();

try {
  for (const prompt of SAMPLES) {
    const ctx = await routePrompt(prompt, { dryRun: true });
    const target = ROUTES[ctx.complexity ?? "complex"][0];
    console.log(prompt);
    console.log(`  → ${ctx.complexity} → ${target}   (${ctx.reason})`);
    console.log();
  }
} catch (error) {
  console.error("Demo failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await stopLangfuse();
}
