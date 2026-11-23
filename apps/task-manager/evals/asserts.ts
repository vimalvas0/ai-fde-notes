// promptfoo `javascript` assertions: the code graders. Each one gets the provider's output and the
// test's vars, and returns { pass, score, reason }. They are free, fast and give the same answer every
// time. The one check code cannot do (is the label summary a good title?) is promptfoo's llm-rubric,
// set up in tests.ts.

import type { IntentOutcome } from "../server/intent.ts";
import type { Labels } from "../server/labels.ts";

export type Expect = {
  intents: string[];
  /** Only the labels listed here are graded. null means "must not be found". */
  labels?: Partial<Record<"time" | "date" | "location", string | null>>;
};
type Ctx = { vars: { expect: Expect } };
type Output = { intent: IntentOutcome; labels?: Labels };

const show = (value: unknown) => JSON.stringify(value);
const result = (pass: boolean, reason: string) => ({ pass, score: pass ? 1 : 0, reason });
const noLabels = result(false, "no labels in output");

// ---- intent ----

/** The set of intents must match exactly (order does not matter). */
export function intentExact(out: Output, { vars }: Ctx) {
  const want = [...vars.expect.intents].sort().join(",");
  const got = [...out.intent.intents].sort().join(",");
  return result(want === got, want === got ? got : `expected [${want}], got [${got}]`);
}

/** The reply passed validation without falling back to the "try rephrasing" answer. */
export function intentNoFallback(out: Output) {
  const fallback = out.intent.fallback;
  return result(!fallback, fallback ? `fell back after two rejected replies: ${fallback}` : "valid on first or second try");
}

// ---- labels ----

function exact(name: "time" | "date", expected: string | null | undefined, labels: Labels) {
  const value = labels[name];
  const pass = value === (expected ?? null);
  return result(pass, pass ? show(value) : `expected ${show(expected ?? null)}, got ${show(value)}`);
}

/** time and date are exact strings, so compare them exactly. */
export const labelTime = (out: Output, { vars }: Ctx) => (out.labels ? exact("time", vars.expect.labels?.time, out.labels) : noLabels);
export const labelDate = (out: Output, { vars }: Ctx) => (out.labels ? exact("date", vars.expect.labels?.date, out.labels) : noLabels);

const normalise = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Locations are free text: "Smile Clinic" and "Smile Clinic, MG Road" are both right.
 * Pass when either normalised string contains the other. null must match null.
 */
export function labelLocation(out: Output, { vars }: Ctx) {
  if (!out.labels) return noLabels;
  const expected = vars.expect.labels?.location ?? null;
  const value = out.labels.location;
  const pass =
    expected === null || value === null
      ? expected === value
      : normalise(value).includes(normalise(expected)) || normalise(expected).includes(normalise(value));
  return result(pass, pass ? show(value) : `expected ${show(expected)}, got ${show(value)}`);
}

const TIME_OR_DATE_WORDS =
  /\b(\d{1,2}(:\d{2})?\s?(am|pm)?|today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|evening|night|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;

/** The summary rules that code can check: 2 to 8 words and no time or date words. */
export function summaryShape(out: Output) {
  if (!out.labels) return noLabels;
  const summary = out.labels.summary;
  const words = summary.trim().split(/\s+/).length;
  const problems: string[] = [];
  if (words < 2 || words > 8) problems.push(`${words} words, expected 2 to 8`);
  const hit = summary.match(TIME_OR_DATE_WORDS);
  if (hit) problems.push(`contains time/date word "${hit[0]}"`);
  return result(problems.length === 0, problems.join("; ") || show(summary));
}
