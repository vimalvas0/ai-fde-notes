// Eval runner: sends every case in dataset.jsonl through the real pipeline, grades each answer,
// prints a report and saves the whole run to evals/runs/ so two runs can be compared.
//
//   npm run eval -- --guardrails off --label baseline   the original pipeline
//   npm run eval -- --label guardrails                  the pipeline with guardrails (default)
//   npm run eval -- --only n01,x01      just these ids
//   npm run eval -- --category adversarial
//   npm run eval -- --repeat 3          run each case 3 times (models are not deterministic)
//   npm run eval -- --no-judge          code graders only (cheaper)

import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { runPipeline } from "../server/pipeline.ts";
import * as g from "./graders.ts";

const { values: args } = parseArgs({
  options: {
    only: { type: "string" },
    category: { type: "string" },
    guardrails: { type: "string", default: "on" },
    repeat: { type: "string", default: "1" },
    "no-judge": { type: "boolean", default: false },
    label: { type: "string", default: "run" },
  },
});

const guardrails = args.guardrails !== "off";
const CONCURRENCY = 4;
const dir = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const fixtures = JSON.parse(readFileSync(`${dir}fixtures.json`, "utf8")) as { resumes: Record<string, string>; jds: Record<string, string> };
const FILLER = " Candidates should communicate clearly, work well in a team, and care about the quality of what they ship.";

let cases: g.Case[] = readFileSync(`${dir}dataset.jsonl`, "utf8")
  .split("\n")
  .filter((line) => line.trim())
  .map((line) => JSON.parse(line));
if (args.only) cases = cases.filter((c) => args.only!.split(",").includes(c.id));
if (args.category) cases = cases.filter((c) => c.category === args.category);
const repeat = Math.max(1, Number(args.repeat));

function resolve(c: g.Case) {
  const pick = (value: string, from: Record<string, string>) => (value.startsWith("@") ? from[value.slice(1)] : value);
  const resume = pick(c.resume, fixtures.resumes);
  let jd = pick(c.jd, fixtures.jds);
  if (c.jdPadTo) {
    while (jd.length < c.jdPadTo) jd += FILLER;
    jd = jd.slice(0, c.jdPadTo);
  }
  return { resume, jd };
}

type Trial = { trial: number; result: string; grades: g.Grade[]; ms: number };

async function runOnce(c: g.Case, trial: number): Promise<Trial> {
  const { resume, jd } = resolve(c);
  const grades: g.Grade[] = [];
  let result = "";
  const started = Date.now();
  try {
    ({ result } = await runPipeline({ resumeText: resume, jd, instruction: c.instruction }, { guardrails }));
    grades.push(g.maxLength(result));
    for (const grade of [g.scoreRange(result, c.expect), g.forbidden(result, c.expect.forbid)]) if (grade) grades.push(grade);
    if (!args["no-judge"]) {
      const verdict = await g.judge(c, resume, jd, result);
      if (verdict) grades.push(verdict);
    }
  } catch (err) {
    grades.push({ grader: "no_crash", pass: false, detail: String(err) });
  }
  return { trial, result, grades, ms: Date.now() - started };
}

const jobs = cases.flatMap((c) => Array.from({ length: repeat }, (_, i) => ({ c, trial: i + 1 })));
const results = new Map<string, Trial[]>();
let next = 0;
async function worker() {
  while (next < jobs.length) {
    const { c, trial } = jobs[next++];
    const done = await runOnce(c, trial); // await first: reading the map before the await would drop concurrent trials
    results.set(c.id, [...(results.get(c.id) ?? []), done]);
    process.stdout.write(".");
  }
}
console.log(`${cases.length} cases x ${repeat} trial(s), guardrails=${guardrails ? "on" : "off"}, judge=${args["no-judge"] ? "off" : "on"}`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log("\n");

// ---- Report ----
const graderStats = new Map<string, { pass: number; total: number }>();
const byCategory = new Map<string, { pass: number; total: number }>();
let casesPassed = 0;
for (const c of cases) {
  const trials = (results.get(c.id) ?? []).sort((a, b) => a.trial - b.trial);
  const passedTrials = trials.filter((t) => t.grades.every((x) => x.pass)).length;
  if (passedTrials === trials.length) casesPassed++;
  const cat = byCategory.get(c.category) ?? { pass: 0, total: 0 };
  cat.total++;
  if (passedTrials === trials.length) cat.pass++;
  byCategory.set(c.category, cat);
  for (const t of trials)
    for (const grade of t.grades) {
      const s = graderStats.get(grade.grader) ?? { pass: 0, total: 0 };
      s.total++;
      if (grade.pass) s.pass++;
      graderStats.set(grade.grader, s);
    }
  const mark = passedTrials === trials.length ? "PASS" : passedTrials === 0 ? "FAIL" : "FLAKY";
  console.log(`${mark.padEnd(5)} ${c.id}  ${passedTrials}/${trials.length}  [${c.category}] ${resolveLabel(c)}`);
  const failures = new Set(trials.flatMap((t) => t.grades.filter((x) => !x.pass).map((x) => `${x.grader}: ${x.detail}`)));
  for (const failure of failures) console.log(`        - ${failure}`);
  if (passedTrials < trials.length) console.log(`        answer: ${JSON.stringify(trials[0].result)}`);
}
function resolveLabel(c: g.Case) {
  return `${c.resume} x ${c.jd}${c.instruction ? ` | "${c.instruction.slice(0, 60)}"` : ""}`;
}

console.log("\nBy category");
for (const [name, s] of byCategory) console.log(`  ${name.padEnd(12)} ${s.pass}/${s.total}`);
console.log("\nBy grader");
for (const [name, s] of graderStats) console.log(`  ${name.padEnd(16)} ${s.pass}/${s.total}  ${Math.round((100 * s.pass) / s.total)}%`);
console.log(`\nCases passing every trial: ${casesPassed}/${cases.length}`);

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
      label: args.label, commit, guardrails, casesPassed, cases: cases.length, repeat,
      byCategory: Object.fromEntries(byCategory), graders: Object.fromEntries(graderStats),
      results: cases.map((c) => ({ id: c.id, category: c.category, instruction: c.instruction, expect: c.expect, trials: results.get(c.id) })),
    },
    null,
    2,
  ) + "\n",
);
console.log(`Saved evals/runs/${file.split("/").pop()}`);
