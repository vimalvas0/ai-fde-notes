// Eval runner: sends every case in dataset.jsonl through the real intent and label steps,
// grades each output, prints a report and saves the whole run to evals/runs/ so two runs can be
// compared with git diff.
//
//   npm run eval                       all cases, once, with the LLM judge
//   npm run eval -- --only c04,c05     just these ids
//   npm run eval -- --tag update       just cases with this tag
//   npm run eval -- --skip-tag in-prompt  leave out cases copied into a prompt (the held-out score)
//   npm run eval -- --repeat 3         run each case 3 times (models are not deterministic)
//   npm run eval -- --no-judge         code graders only (cheaper)
//   npm run eval -- --label baseline   name for the saved file

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { detectIntent } from "../server/intent.ts";
import { extractLabels } from "../server/labels.ts";
import { MODELS, type ActionContext } from "../server/llm.ts";
import * as g from "./graders.ts";

const { values: args } = parseArgs({
  options: {
    only: { type: "string" },
    tag: { type: "string" },
    "skip-tag": { type: "string" },
    repeat: { type: "string", default: "1" },
    "no-judge": { type: "boolean", default: false },
    label: { type: "string", default: "run" },
  },
});

// A fixed clock, so "tomorrow" always means the same day and expected dates never go stale.
const NOW = "Wednesday 2026-11-18 10:00 (Asia/Kolkata)";
const CONCURRENCY = 5;

const dir = new URL(".", import.meta.url).pathname;
let cases: g.Case[] = readFileSync(`${dir}dataset.jsonl`, "utf8")
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));
if (args.only) cases = cases.filter((c) => args.only!.split(",").includes(c.id));
if (args.tag) cases = cases.filter((c) => c.tags.includes(args.tag!));
if (args["skip-tag"]) cases = cases.filter((c) => !c.tags.includes(args["skip-tag"]!));
const repeat = Math.max(1, Number(args.repeat));

type Trial = { trial: number; output: Record<string, unknown>; grades: g.Grade[]; costUsd: number; error?: string };

async function runOnce(c: g.Case, trial: number): Promise<Trial> {
  const ctx: ActionContext = { calls: [] };
  const grades: g.Grade[] = [];
  const output: Record<string, unknown> = {};
  try {
    const intent = await detectIntent(ctx, c.input, NOW);
    output.intent = intent;
    grades.push(g.intentExact(c.expect.intents, intent), g.intentNoFallback(intent));

    // Labels are graded on the user's sentence itself. In the app the agent rewrites it first,
    // so this tests the label model alone, not the agent.
    if (c.expect.labels) {
      const { labels, error } = await extractLabels(ctx, c.input, NOW);
      output.labels = labels;
      if (error) output.labelError = error;
      const want = c.expect.labels;
      if ("time" in want) grades.push(g.labelExact("time", want.time ?? null, labels));
      if ("date" in want) grades.push(g.labelExact("date", want.date ?? null, labels));
      if ("location" in want) grades.push(g.labelLocation(want.location ?? null, labels));
      grades.push(g.summaryShape(labels));
      if (!args["no-judge"]) grades.push(await g.judgeSummary(ctx, c.input, labels));
    }
  } catch (err) {
    grades.push({ grader: "no_crash", pass: false, detail: String(err) });
  }
  const costUsd = ctx.calls.reduce((sum, call) => sum + call.costUsd, 0);
  return { trial, output, grades, costUsd };
}

// Run every (case, trial) pair with a small pool so we do not hit rate limits.
const jobs = cases.flatMap((c) => Array.from({ length: repeat }, (_, i) => ({ c, trial: i + 1 })));
const results = new Map<string, Trial[]>();
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const { c, trial } = jobs[next++];
    const result = await runOnce(c, trial);
    results.set(c.id, [...(results.get(c.id) ?? []), result]);
    process.stdout.write(".");
  }
}
console.log(`${cases.length} cases x ${repeat} trial(s), intent=${MODELS.intent} label=${MODELS.label} judge=${args["no-judge"] ? "off" : g.JUDGE_MODEL}`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log("\n");

// ---- Report ----
const graderStats = new Map<string, { pass: number; total: number }>();
let casesPassed = 0;
let cost = 0;
for (const c of cases) {
  const trials = (results.get(c.id) ?? []).sort((a, b) => a.trial - b.trial);
  const passedTrials = trials.filter((t) => t.grades.every((x) => x.pass)).length;
  if (passedTrials === trials.length) casesPassed++;
  for (const t of trials) {
    cost += t.costUsd;
    for (const grade of t.grades) {
      const s = graderStats.get(grade.grader) ?? { pass: 0, total: 0 };
      s.total++;
      if (grade.pass) s.pass++;
      graderStats.set(grade.grader, s);
    }
  }
  const mark = passedTrials === trials.length ? "PASS" : passedTrials === 0 ? "FAIL" : "FLAKY";
  console.log(`${mark.padEnd(5)} ${c.id}  ${passedTrials}/${trials.length}  ${c.input}`);
  // Show each distinct failure once, not once per trial.
  const failures = new Set(trials.flatMap((t) => t.grades.filter((x) => !x.pass).map((x) => `${x.grader}: ${x.detail}`)));
  for (const failure of failures) console.log(`        - ${failure}`);
}

console.log("\nBy grader");
for (const [name, s] of graderStats) console.log(`  ${name.padEnd(20)} ${s.pass}/${s.total}  ${Math.round((100 * s.pass) / s.total)}%`);
console.log(`\nCases passing every trial: ${casesPassed}/${cases.length}   cost: $${cost.toFixed(4)}`);

// ---- Save ----
let commit = "unknown";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: dir }).toString().trim();
  if (execSync("git status --porcelain -- ../server", { cwd: dir }).toString().trim()) commit += "+dirty";
} catch {}
mkdirSync(`${dir}runs`, { recursive: true });
const file = `${dir}runs/${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}-${args.label}.json`;
writeFileSync(
  file,
  JSON.stringify(
    {
      label: args.label, commit, now: NOW, models: { ...MODELS, judge: args["no-judge"] ? null : g.JUDGE_MODEL },
      casesPassed, cases: cases.length, repeat, costUsd: cost,
      graders: Object.fromEntries(graderStats),
      results: cases.map((c) => ({ id: c.id, input: c.input, expect: c.expect, trials: results.get(c.id) })),
    },
    null,
    2,
  ) + "\n",
);
console.log(`Saved ${file.slice(dir.length - "evals/".length)}`);
