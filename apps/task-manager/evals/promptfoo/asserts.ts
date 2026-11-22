// promptfoo javascript assertions that reuse the code graders in ../graders.ts, so promptfoo and
// npm run eval grade exactly the same way. Each one gets the provider output and the test vars.

import * as g from "../graders.ts";

type Ctx = { vars: { expect: g.Case["expect"] } };
type Output = { intent: Parameters<typeof g.intentExact>[1]; labels?: Parameters<typeof g.summaryShape>[0] };

const toResult = (grade: g.Grade) => ({ pass: grade.pass, score: grade.pass ? 1 : 0, reason: `${grade.grader}: ${grade.detail}` });
const noLabels = { pass: false, score: 0, reason: "no labels in output" };

export const intentExact = (out: Output, { vars }: Ctx) => toResult(g.intentExact(vars.expect.intents, out.intent));
export const intentNoFallback = (out: Output) => toResult(g.intentNoFallback(out.intent));
export const labelTime = (out: Output, { vars }: Ctx) =>
  out.labels ? toResult(g.labelExact("time", vars.expect.labels?.time ?? null, out.labels)) : noLabels;
export const labelDate = (out: Output, { vars }: Ctx) =>
  out.labels ? toResult(g.labelExact("date", vars.expect.labels?.date ?? null, out.labels)) : noLabels;
export const labelLocation = (out: Output, { vars }: Ctx) =>
  out.labels ? toResult(g.labelLocation(vars.expect.labels?.location ?? null, out.labels)) : noLabels;
export const summaryShape = (out: Output) => (out.labels ? toResult(g.summaryShape(out.labels)) : noLabels);
