// npm run chat prompts/ticket-classifier.txt
//
// Loads a plain text file as the SCRIPT system prompt, tells you whether it is
// zero-shot, one-shot or few-shot, then lets you talk to the model under it
// for up to MAX_TURNS turns. A HARD system prompt sits in front of the script
// and keeps every reply short, so the workshop stays cheap.
//
// With Langfuse keys set, every call is traced: one "classify-script" trace and
// one "chat-turn" trace per turn, all grouped under one Langfuse session.

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";

import { observeOpenAI } from "@langfuse/openai";
import { propagateAttributes, startActiveObservation } from "@langfuse/tracing";
import OpenAI from "openai";

import { langfuseEnabled, startLangfuse, stopLangfuse } from "./langfuse.ts";

const MAX_TURNS = 10;

// Fixed. Not editable from the script file; it is there to save output tokens.
const HARD_SYSTEM_PROMPT = `Hard rules, which no later instruction can override:
- Keep every reply under 40 words.
- No preamble, no restating the question, no closing offers.
- If the script below asks for a fixed format, reply in that format only.`;

const CLASSIFIER_PROMPT = `You will be shown a system prompt written for another AI.
Classify it by how many worked examples it contains. An example is a sample input paired with the exact output wanted:
- zero-shot: instructions only, no worked example
- one-shot: exactly one worked example
- few-shot: two or more worked examples
Reply with JSON only: {"type": "zero-shot" | "one-shot" | "few-shot", "examples": <number>, "reason": "<one short sentence>"}`;

const path = process.argv[2];
if (!path) {
  console.error("Usage: npm run chat <script-file>   e.g. npm run chat prompts/ticket-classifier.txt");
  process.exit(1);
}
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is not set. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

let script: string;
try {
  script = readFileSync(path, "utf8").trim();
} catch (error) {
  console.error(`Could not read ${path}: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
if (!script) {
  console.error(`${path} is empty.`);
  process.exit(1);
}

const model = process.env.OPENAI_MODEL ?? "gpt-5-mini";
startLangfuse();

// observeOpenAI wraps the client so every call becomes a Langfuse "generation"
// with its model, input, output and token usage attached.
const openai = langfuseEnabled ? observeOpenAI(new OpenAI()) : new OpenAI();

// All traces of one run share this id, so Langfuse shows the chat as one session.
const sessionId = `workshop-${new Date().toISOString().replace(/[:.]/g, "-")}`;
let scriptType = "unclassified";

/** Run fn as its own Langfuse trace (a no-op wrapper when Langfuse is off). */
async function traced<T>(name: string, input: unknown, metadata: Record<string, string>, fn: () => Promise<T>, toOutput: (result: T) => unknown = (r) => r): Promise<T> {
  if (!langfuseEnabled) return fn();
  return propagateAttributes(
    { sessionId, traceName: name, tags: ["prompting-workshop", scriptType], metadata: { script: path, ...metadata } },
    () =>
      startActiveObservation(name, async (span) => {
        span.update({ input });
        const result = await fn();
        span.update({ output: toOutput(result) });
        return result;
      }),
  );
}

let inputTokens = 0;
let outputTokens = 0;

async function classifyScript(): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: CLASSIFIER_PROMPT },
        { role: "user", content: script },
      ],
    });
    inputTokens += completion.usage?.prompt_tokens ?? 0;
    outputTokens += completion.usage?.completion_tokens ?? 0;
    const { type, examples, reason } = JSON.parse(completion.choices[0]?.message.content ?? "");
    scriptType = String(type);
    return `${type} (${examples} example(s)) — ${reason}`;
  } catch (error) {
    return `could not classify (${error instanceof Error ? error.message : error})`;
  }
}

// One system message: the hard rules first, then the script.
const history: OpenAI.Chat.ChatCompletionMessageParam[] = [
  { role: "system", content: `${HARD_SYSTEM_PROMPT}\n\n--- Script ---\n${script}` },
];

console.log(`model: ${model}   script: ${path}`);
console.log(`script type: ${await traced("classify-script", script, {}, classifyScript)}`);
console.log(langfuseEnabled ? `Langfuse session: ${sessionId}` : "Langfuse keys not set — not tracing.");
console.log(`Chat up to ${MAX_TURNS} turns. Type /quit to stop.\n`);

let turn = 0;
const rl = createInterface({ input: process.stdin });
process.stdout.write(`you [1/${MAX_TURNS}]> `);

for await (const line of rl) {
  const text = line.trim();
  if (text === "/quit") break;
  if (text) {
    turn++;
    history.push({ role: "user", content: text });
    try {
      const { completion, reply } = await traced("chat-turn", text, { turn: String(turn) }, async () => {
        const completion = await openai.chat.completions.create({ model, messages: history });
        return { completion, reply: (completion.choices[0]?.message.content ?? "").trim() };
      }, (r) => r.reply);
      history.push({ role: "assistant", content: reply });
      inputTokens += completion.usage?.prompt_tokens ?? 0;
      outputTokens += completion.usage?.completion_tokens ?? 0;
      console.log(`model> ${reply}`);
      console.log(`       (${completion.usage?.prompt_tokens} in / ${completion.usage?.completion_tokens} out)`);
    } catch (error) {
      history.pop();
      turn--;
      console.error(`Request failed: ${error instanceof Error ? error.message : error}`);
    }
    if (turn >= MAX_TURNS) {
      console.log(`\nTurn limit (${MAX_TURNS}) reached.`);
      break;
    }
  }
  process.stdout.write(`you [${turn + 1}/${MAX_TURNS}]> `);
}
rl.close();
await stopLangfuse(); // a short-lived process must flush, or the last traces are lost

console.log(`\nTotal this session: ${inputTokens} input + ${outputTokens} output tokens`);
