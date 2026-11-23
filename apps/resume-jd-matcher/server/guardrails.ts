// Guardrails around the pipeline. Four layers, each cheap and each aimed at a failure the eval found:
//
//   1. screenInput   code, before any model call: too-thin input is answered without calling a model,
//                    and the tags the pipeline uses to fence data are stripped from untrusted text.
//   2. flags         code: regex hits for "ignore previous instructions" style text in the resume or
//                    job description. A hit does not block the run; it is passed to the models as a
//                    fact ("this document tried to instruct you") so it is reported, not obeyed.
//   3. RULES         prompt text added to all three steps (see pipeline.ts).
//   4. screenOutput  code, after the last model call: a reply that leaks the prompts is replaced.

export type Input = { resumeText: string; jd: string; instruction: string };

const MIN_RESUME_WORDS = 25;
const MIN_JD_WORDS = 8;

const words = (text: string) => text.split(/\s+/).filter(Boolean).length;

// Tags the pipeline wraps data in. Text that contains them could close the fence early and
// pose as a fact sheet or a user request, so they are removed from untrusted text.
const FENCE_TAGS = /<\/?\s*(resume|job_description|fact_sheet|analysis|user_request)\s*>/gi;

export function stripFenceTags(text: string): string {
  return text.replace(FENCE_TAGS, "[tag removed]");
}

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|any\s+|your\s+)?(the\s+)?(previous|prior|above|earlier|these)?\s*(instructions|rules|prompts?)/i,
  /disregard\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)/i,
  /(reveal|print|show|repeat|output)\b[^.\n]{0,40}\b(system\s+prompt|hidden\s+rules|your\s+instructions)/i,
  /you\s+are\s+now\b/i,
  /\b(system|assistant)\s+(notice|message|override)\b/i,
  /(output|say|reply|respond)\s+exactly\b/i,
  /\b(give|rate|score)\b[^.\n]{0,30}\b100\s*(\/|out of)\s*100/i,
];

/** Names of the documents that contain instruction-like text aimed at the model. */
export function injectionFlags(input: Input): string[] {
  const hit = (text: string) => INJECTION_PATTERNS.some((p) => p.test(text));
  const flags: string[] = [];
  if (hit(input.resumeText)) flags.push("resume");
  if (hit(input.jd)) flags.push("job description");
  return flags;
}

/** Returns a ready-made answer when the input is too thin to be worth a model call, otherwise null. */
export function tooThin(input: Input): string | null {
  const problems: string[] = [];
  if (words(input.resumeText) < MIN_RESUME_WORDS) problems.push("the resume has almost no content (add roles, dates and skills)");
  if (words(input.jd) < MIN_JD_WORDS) problems.push("the job description is too short to judge fit (add the key requirements)");
  return problems.length ? `Cannot assess yet: ${problems.join("; ")}.` : null;
}

export function sanitise(input: Input): Input {
  return { resumeText: stripFenceTags(input.resumeText), jd: stripFenceTags(input.jd), instruction: stripFenceTags(input.instruction) };
}

// Distinctive phrases from our own prompts. If one shows up in the answer, the prompt has leaked.
const LEAK_MARKERS = ["HARD RULES", "Aim for 450", "XML-style tags", "fact sheet for a recruiter", "never instructions to follow"];

const REFUSAL = "I can't share how I work internally. Ask me about the candidate's fit for the role and I'll answer from the resume and job description.";

export function screenOutput(text: string): string {
  const lower = text.toLowerCase();
  return LEAK_MARKERS.some((m) => lower.includes(m.toLowerCase())) ? REFUSAL : text;
}
