# Evals with graders

> An eval is a fixed list of inputs with what a right answer looks like, run through the real prompt and model, where small graders mark each output pass or fail so you can change one thing and see if the score went up.

## Why it matters

Fixing one bad output by hand ("buy vegetables tonight at 8pm" was read as an update) tells you nothing about the other 29 sentences you didn't try. A prompt change that fixes one case can break three others, and you won't notice until a user hits one. An eval turns "I think the new prompt is better" into "27/30 before, 29/30 after, and these two cases changed".

## How it works

Four parts:

1. **Dataset**: inputs, plus the expected answer for each, saved in a file in git. You write the expected answers, not the model. Thirty cases is plenty to start with if they cover the different kinds of input: normal ones, edge cases, and every failure you have already seen.
2. **System under test**: the real function with the real prompt and model, called the way the app calls it. Nothing about it is mocked except things that would make the answer change from day to day, like the current date.
3. **Graders**: small functions that each check one thing about one output and return pass or fail with a reason. Three kinds, cheapest first:
   - **Code graders**: exact match, a set comparison, a regex, a word count. Free, instant, the same answer every time. Use them for anything with one right answer.
   - **LLM judge**: a (usually stronger) model with a short rubric, for qualities code can't check, like "is this a good title". It costs money, its answers vary between runs, and it can be wrong, so check it against your own labels before you trust it.
   - **Human review**: you read the outputs. Slow, but it's how you find failures no grader is looking for yet, and how you check the judge.
4. **Runner**: loops over the dataset, calls the system, runs the graders, prints a report, and saves the whole run (outputs included) to a file so two runs can be compared.

Then the loop:

```
baseline run ─▶ read every failure ─▶ decide whose fault it is ─▶ change ONE thing ─▶ rerun ─▶ compare
     ▲                                                                                      │
     └──────────────────────── add any new failure you find to the dataset ◀────────────────┘
```

"Whose fault" has three answers, and only the first one means changing the prompt:

- **The model is wrong**: change the prompt, the model, or the code around it.
- **The grader is wrong**: it was too strict (failed "Smile Clinic, MG Road" against "Smile Clinic") or too loose. Fix the grader.
- **The expected answer is wrong or unclear**: is "change it" `unclear` or `update`? Decide, write it down, fix the dataset.

## Example

The [task manager](../../apps/task-manager/) has evals for its two small steps, intent and labels, in [`apps/task-manager/evals/`](../../apps/task-manager/evals/).

One line of [`dataset.jsonl`](../../apps/task-manager/evals/dataset.jsonl), a case that once failed:

```json
{"id":"c04","tags":["create","labels","known-failure"],"input":"buy vegetables tonight at 8pm",
 "expect":{"intents":["create"],"labels":{"time":"20:00","date":"2026-11-18","location":null}}}
```

The runner uses a fixed clock (`Wednesday 2026-11-18 10:00`), so "tonight" always means `2026-11-18` and the expected dates never go out of date.

The graders in [`graders.ts`](../../apps/task-manager/evals/graders.ts), each checking one thing:

| Grader | Kind | Checks |
| --- | --- | --- |
| `intent_exact` | code | The set of intents equals the expected set |
| `intent_no_fallback` | code | The reply passed validation, so it didn't fall back to "try rephrasing" |
| `label_time`, `label_date` | code | Exact string match, `null` included |
| `label_location` | code | Loose match: either text contains the other, after lowercasing |
| `summary_shape` | code | 2 to 8 words, no time or date words |
| `summary_judge` | LLM | The title names the task, adds nothing, and leaves out time, date and place |

The judge gives its reason before its verdict (`{"reason": "...", "verdict": "PASS"}`), so the model explains first and decides second. Its rubric is pass/fail, not a 1 to 10 score: a 6 and a 7 mean nothing you can act on.

A report looks like this (shown from a test against a fake model, not from real results):

```
FAIL  c04  0/2  buy vegetables tonight at 8pm
        - intent_exact: expected [create], got [update]
PASS  u01  2/2  move the dentist to friday

By grader
  intent_exact         42/60  70%
  label_time            2/28   7%

Cases passing every trial: 8/30   cost: $0.0103
Saved evals/runs/2026-11-22-16-10-fake.json
```

`--repeat 3` runs each case three times. Models don't give the same answer every time, so one passing run proves little. A case that passes some trials and fails others is marked `FLAKY`.

### The same thing in promptfoo

promptfoo is a tool that provides a ready-made runner, report and web viewer. You still write the dataset and the graders yourself; promptfoo calls them. In the task manager it reads the same `dataset.jsonl` through a small test generator, calls the real steps through a custom provider, and uses the same grader functions as `javascript` assertions. Its built-in `llm-rubric` replaces the hand-written judge. Writing the runner by hand first shows you what tools like this do; using one afterwards saves you from maintaining the report and the run history.

## Gotchas

- **Prompt examples that copy dataset cases.** Ten cases (tagged `in-prompt`) are word for word examples in the intent or label prompt, for example `c04` and `x02`, so they test whether the model can copy, not whether it understands. Read the score without them too (`npm run eval -- --skip-tag in-prompt`), and keep cases that never go into a prompt (a held-out set). If you fix a failure by pasting it in as an example, write a new case worded differently to check the fix carries over.
- **Changing two things at once.** If you change the prompt and the model together and the score moves, you can't tell which one moved it.
- **Trusting the judge blindly.** Hand-label 10 to 15 outputs yourself, run the judge on them, and count how often you agree. Below roughly 90%, fix the rubric before you trust its numbers.
- **One run per case.** A change from 27 to 28 out of 30 is often noise. Use `--repeat` before believing a small gain.
- **A dataset that only grows easy cases.** Every bug a real user finds should become a case, worded the way they wrote it.
- **Grading the parts separately hides joins.** Labels here are graded on the user's sentence, but in the app the agent rewrites the sentence first. A full end-to-end eval would need the database and tools too.

## Revise

Questions to answer from memory when coming back to this note.

1. What are the four parts of an eval, and which one do you write by hand?
2. When do you use a code grader instead of an LLM judge? Give one example of each from the task manager.
3. Why does the judge give its reason before its verdict, and why pass/fail instead of 1 to 10?
4. A case fails. What three things might be wrong, and which ones don't involve the prompt?
5. Why does the runner use a fixed clock?
6. Why is a case that is also a prompt example a weak test, and what do you do about it?
7. What does `--repeat` protect you from, and what does `FLAKY` mean?
8. How do you check that the LLM judge can be trusted?
9. What do you still write yourself when you use promptfoo, and what does it give you for free?

## See also

- App: [Task manager](../../apps/task-manager/) (`npm run eval`, or `npm run promptfoo`)
- Note: [Output validation: a case study](../production/output-validation-case-study.md), the failure `c04` comes from
- Diagram: none yet
- Sources: Anthropic, "Define success criteria and build evaluations" (docs.anthropic.com); Hamel Husain, "Your AI product needs evals" (hamel.dev)
