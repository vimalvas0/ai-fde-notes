// npm run shots [-- zero one few] [--file prompts/x.txt] [--temperature 0.7]
//
// A tinkering workshop. Either edit the three blocks below (TASK, EXAMPLES,
// INPUTS) or pass --file with a plain text script that defines them (see
// prompts/). Rerun and watch how the same inputs behave under three prompts:
//
//   zero-shot  instruction only
//   one-shot   instruction + the first example
//   few-shot   instruction + every example
//
// Examples are sent as earlier user/assistant message pairs, so the model
// sees them as turns it has "already answered" and copies their pattern.

import { readFileSync } from "node:fs";

import OpenAI from "openai";

// ─── 1. TASK: the instruction every mode gets (the system prompt) ──────────
let TASK = `Classify the customer message into exactly one label:
billing, bug, feature_request, other.
Reply with the label only.`;

// ─── 2. EXAMPLES: input → expected output. One-shot uses the first, few-shot uses all.
// Try: removing the "Reply with the label only" line above and seeing which
// mode still answers in the right format. Then try bad or conflicting examples.
let EXAMPLES: { input: string; output: string }[] = [
  { input: "I was charged twice for May.", output: "billing" },
  { input: "The export button does nothing when I click it.", output: "bug" },
  { input: "Could you add dark mode?", output: "feature_request" },
  { input: "What are your opening hours?", output: "other" },
];

// ─── 3. INPUTS: what you test with. Include tricky ones on purpose. ────────
let INPUTS: string[] = [
  "My invoice shows a plan I never signed up for.",
  "The app crashes whenever I upload a PNG.",
  "It would be great to export reports as PDF.",
  "Love the product, keep it up!",
  "I was billed after the app crashed during checkout.", // two labels fit
  "Cancel my account and refund me.", // billing or other?
];

// ─── Runner (you rarely need to touch below) ───────────────────────────────
type Mode = "zero" | "one" | "few";
const ALL_MODES: Mode[] = ["zero", "one", "few"];

const args = process.argv.slice(2);
const tempIndex = args.indexOf("--temperature");
const temperature = tempIndex >= 0 ? Number(args[tempIndex + 1]) : undefined;
const fileIndex = args.indexOf("--file");
const file = fileIndex >= 0 ? args[fileIndex + 1] : undefined;
const modes = ALL_MODES.filter((m) => args.includes(m));
const selected = modes.length > 0 ? modes : ALL_MODES;

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}
if (temperature !== undefined && Number.isNaN(temperature)) {
  console.error("--temperature needs a number, e.g. --temperature 0.7");
  process.exit(1);
}

// Script format: sections start with @task, @example or @input on their own line.
// An @example body is "input", a line containing only =>, then "output".
// Every @input section is one test input (it may span several lines).
function loadScript(path: string): void {
  const sections = readFileSync(path, "utf8").split(/^@(task|example|input)[ 	]*$/m);
  const task: string[] = [];
  const examples: typeof EXAMPLES = [];
  const inputs: string[] = [];
  for (let i = 1; i < sections.length; i += 2) {
    const body = (sections[i + 1] ?? "").trim();
    if (sections[i] === "task") task.push(body);
    else if (sections[i] === "input") inputs.push(body);
    else {
      const [input, output] = body.split(/^=>[ 	]*$/m).map((t) => t.trim());
      if (!input || !output) throw new Error(`@example needs "input", a line with only =>, then "output":\n${body}`);
      examples.push({ input, output });
    }
  }
  if (task.length === 0 || inputs.length === 0) throw new Error("The script needs at least one @task and one @input.");
  TASK = task.join("\n\n");
  EXAMPLES = examples;
  INPUTS = inputs;
}

if (fileIndex >= 0) {
  try {
    if (!file) throw new Error("--file needs a path");
    loadScript(file);
  } catch (error) {
    console.error(`Could not load script: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";
const openai = new OpenAI();

function buildMessages(mode: Mode, input: string): OpenAI.Chat.ChatCompletionMessageParam[] {
  const shots = mode === "zero" ? [] : mode === "one" ? EXAMPLES.slice(0, 1) : EXAMPLES;
  return [
    { role: "system", content: TASK },
    ...shots.flatMap((s) => [
      { role: "user" as const, content: s.input },
      { role: "assistant" as const, content: s.output },
    ]),
    { role: "user", content: input },
  ];
}

async function run(mode: Mode, input: string) {
  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: buildMessages(mode, input),
      // Some models (e.g. reasoning ones) reject temperature, so only send it when asked.
      ...(temperature !== undefined && { temperature }),
    });
    return {
      answer: (completion.choices[0]?.message.content ?? "").trim(),
      inputTokens: completion.usage?.prompt_tokens ?? 0,
    };
  } catch (error) {
    return { answer: `ERROR: ${error instanceof Error ? error.message : error}`, inputTokens: 0 };
  }
}

console.log(`model: ${model}${temperature !== undefined ? `   temperature: ${temperature}` : ""}`);
if (file) console.log(`script: ${file}`);
console.log(`modes: ${selected.join(", ")}-shot   examples available: ${EXAMPLES.length}\n`);

const results = await Promise.all(
  INPUTS.map(async (input) => ({
    input,
    byMode: Object.fromEntries(await Promise.all(selected.map(async (m) => [m, await run(m, input)]))) as Record<Mode, Awaited<ReturnType<typeof run>>>,
  })),
);

for (const { input, byMode } of results) {
  console.log(`• ${input}`);
  for (const m of selected) console.log(`    ${m.padEnd(5)} → ${byMode[m].answer}`);
  // Disagreement between modes is the interesting signal: the examples changed the answer.
  if (new Set(selected.map((m) => byMode[m].answer)).size > 1) console.log("    (modes disagree)");
  console.log();
}

console.log("Input tokens per request (examples are resent every time, so they cost tokens):");
for (const m of selected) {
  const tokens = results.map((r) => r.byMode[m].inputTokens);
  console.log(`    ${m.padEnd(5)} ${Math.round(tokens.reduce((a, b) => a + b, 0) / tokens.length)} avg`);
}
