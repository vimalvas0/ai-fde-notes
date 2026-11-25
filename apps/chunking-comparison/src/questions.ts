import type { Question } from "./types.ts";

/** The fixed question set. Every config is scored on exactly these. */
const tokens = "notes/fundamentals/tokens-and-context-window.md";
const toolErrors = "notes/agents/tool-call-errors.md";
const sampling = "notes/fundamentals/temperature-and-sampling-parameters.md";
const graders = "notes/evals/graders.md";

export const QUESTIONS: Question[] = [
  { q: "Roughly how many tokens is one page of English text?", source: tokens, section: "Size estimates" },
  {
    q: "How much room is left for chat history after the system prompt, tool definitions and reserved output?",
    source: tokens,
    section: "Context budget",
  },
  {
    q: "Why does a timestamp at the top of the system prompt defeat prompt caching?",
    source: tokens,
    section: "Best practices",
  },
  { q: "Should code retry a tool call that returned 404 not found?", source: toolErrors, section: "The error types" },
  {
    q: "Why enforce a refund limit in code and not only in the system prompt?",
    source: toolErrors,
    section: "Policy goes in code",
  },
  {
    q: "What fields should every tool error have so the model decides from fields, not sentences?",
    source: toolErrors,
    section: "One error shape",
  },
  {
    q: "How does temperature change the probabilities the model picks from?",
    source: sampling,
    section: "Temperature",
  },
  {
    q: "What is nucleus sampling and how is top-p different from top-k?",
    source: sampling,
    section: "Top-k and top-p",
  },
  {
    q: "Which temperature should I use for extraction versus brainstorming in my own app?",
    source: sampling,
    section: "When you build an app",
  },
  { q: "What is the difference between a code grader and an LLM judge?", source: graders, section: "How it works" },
  {
    q: "What does the eval loop look like and who is at fault when a case fails?",
    source: graders,
    section: "How it works",
  },
  {
    q: "In the task manager, which step turns one sentence into intents and which picks the task ids?",
    source: "apps/task-manager/README.md",
    section: "How it works",
  },
  {
    q: 'Why did "Buy vegetables tonight at 8pm" fail validation twice?',
    source: "apps/task-manager/README.md",
    section: "Buy vegetables",
  },
  {
    q: "How do I run the same prompt-injection attacks against the weak and the hardened support bot?",
    source: "apps/prompting-workshop/README.md",
    section: "Workshop 2",
  },
  {
    q: "What happens in the resume matcher when an OpenAI call fails, and how is the 500-character limit enforced?",
    source: "apps/resume-jd-matcher/README.md",
    section: "How it works",
  },
];
