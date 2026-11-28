// Graders: each one looks at one output and answers pass or fail, with a short reason.
// Code graders come first because they are free, fast and give the same answer every time.
// The one LLM judge is only for what code cannot check: whether a summary is a good title.

import { chat, type ActionContext } from "../server/llm.ts";
import type { IntentOutcome } from "../server/intent.ts";
import type { Labels } from "../server/labels.ts";

export type Grade = { grader: string; pass: boolean; detail: string };

export type Case = {
  id: string;
  tags: string[];
  input: string;
  expect: {
    intents: string[];
    /** Only the labels listed here are graded. null means "must not be found". */
    labels?: Partial<Record<"time" | "date" | "location", string | null>>;
  };
};

const show = (value: unknown) => JSON.stringify(value);

// ---- Code graders: intent ----

/** The set of intents must match exactly (order does not matter). */
export function intentExact(expected: string[], got: IntentOutcome): Grade {
  const a = [...expected].sort().join(",");
  const b = [...got.intents].sort().join(",");
  return { grader: "intent_exact", pass: a === b, detail: a === b ? b : `expected [${a}], got [${b}]` };
}

/** The reply passed validation without falling back to the "try rephrasing" answer. */
export function intentNoFallback(got: IntentOutcome): Grade {
  return {
    grader: "intent_no_fallback",
    pass: !got.fallback,
    detail: got.fallback ? `fell back after two rejected replies: ${got.fallback}` : "valid on first or second try",
  };
}

// ---- Code graders: labels ----

/** time and date are exact strings, so compare them exactly. */
export function labelExact(name: "time" | "date", expected: string | null, got: Labels): Grade {
  const value = got[name];
  const pass = value === expected;
  return { grader: `label_${name}`, pass, detail: pass ? show(value) : `expected ${show(expected)}, got ${show(value)}` };
}

const normalise = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Locations are free text: "Smile Clinic" and "Smile Clinic, MG Road" are both right.
 * Pass when either normalised string contains the other. null must match null.
 */
export function labelLocation(expected: string | null, got: Labels): Grade {
  const value = got.location;
  const pass =
    expected === null || value === null
      ? expected === value
      : normalise(value).includes(normalise(expected)) || normalise(expected).includes(normalise(value));
  return { grader: "label_location", pass, detail: pass ? show(value) : `expected ${show(expected)}, got ${show(value)}` };
}

const TIME_OR_DATE_WORDS =
  /\b(\d{1,2}(:\d{2})?\s?(am|pm)?|today|tonight|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|evening|night|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i;

/** The summary rules that code can check: 2 to 8 words and no time or date words. */
export function summaryShape(got: Labels): Grade {
  const words = got.summary.trim().split(/\s+/).length;
  const problems: string[] = [];
  if (words < 2 || words > 8) problems.push(`${words} words, expected 2 to 8`);
  const hit = got.summary.match(TIME_OR_DATE_WORDS);
  if (hit) problems.push(`contains time/date word "${hit[0]}"`);
  return { grader: "summary_shape", pass: problems.length === 0, detail: problems.join("; ") || show(got.summary) };
}

// ---- LLM judge ----

export const JUDGE_MODEL = process.env.JUDGE_MODEL ?? "gpt-5-mini";

const JUDGE_PROMPT = `You grade one output of a task manager. A small model read a task and wrote a short title (summary) for it. The title is shown in a list and used later to find the task again ("move sara to 5pm" must find "Call Sara").

PASS only if all of these hold:
1. It names the task's action or object, so a person could tell this task apart from others (who, what, which). "Call Sara" passes; "Call" or "Task" fails.
2. It says nothing the task does not say (no invented people, places or details).
3. It leaves out the time, date and place.

Otherwise FAIL. Judge only the title. Give a one-sentence reason first, then the verdict.`;

const JUDGE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "verdict",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["reason", "verdict"],
      properties: {
        reason: { type: "string" },
        verdict: { type: "string", enum: ["PASS", "FAIL"] },
      },
    },
  },
} as const;

/** Asks a stronger model whether the summary is a good, faithful title. Reason comes before verdict so the judge thinks first. */
export async function judgeSummary(ctx: ActionContext, input: string, got: Labels): Promise<Grade> {
  const reply = await chat(ctx, "judge:summary", {
    model: JUDGE_MODEL,
    messages: [
      { role: "system", content: JUDGE_PROMPT },
      { role: "user", content: `<task>\n${input}\n</task>\n<title>\n${got.summary}\n</title>` },
    ],
    response_format: JUDGE_FORMAT,
    effort: "low",
  });
  try {
    const { reason, verdict } = JSON.parse(reply.content ?? "") as { reason: string; verdict: string };
    return { grader: "summary_judge", pass: verdict === "PASS", detail: `${show(got.summary)}: ${reason}` };
  } catch {
    return { grader: "summary_judge", pass: false, detail: "judge reply was not valid JSON" };
  }
}
