# Output validation: a case study

> Checking a model's JSON against a schema catches a wrong answer, but it does not make the next answer right; the retry has to tell the model what the valid choices are, and the step needs a safe way out when it still fails.

## Why it matters

Structured output makes a model's reply parseable. It does not make it correct. A reply can be valid JSON, match the schema's types, and still be wrong for this situation. Code that acts on the reply (create a task, delete a record) needs a second check for meaning, and a plan for when that check fails. This note follows one real failure from the [task manager](../../apps/task-manager/) through diagnosis to fix.

## How it works

Three layers, each catching a different kind of mistake:

1. **Shape**: a strict JSON schema sent with the request. The API forces the right keys and types, so the reply parses.
2. **Meaning**: a validator in your code (here zod) checks rules the schema cannot express: an update must name a task, `missing_labels` must list exactly the null fields, a date must exist on the calendar.
3. **Recovery**: what happens on a rejection. Retry with feedback, then fall back to a safe answer.

The retry message is the part most often done badly. "Fix it and try again" gives the model the same input with no new information, and a small model usually repeats itself.

## Example

The task manager has a middle step: a small model (`gpt-5-nano`) reads the user's sentence and returns `{intents, task_ids, summary, message}` before the agent acts. The task list held `TSK-001: Go to cousin's wedding at 9 pm`. The user typed:

> Buy vegetables tonight at 8pm

**What failed.** The screen showed `Intent detection failed validation twice (task_ids: an update needs the id of the task to change).` and nothing was created.

**Why (inferred from the error text; the raw reply was not saved).**

1. The small model most likely answered `intents: ["update"]` with an empty `task_ids`, reading "tonight at 8pm" next to an existing evening task as "change that time".
2. The meaning check rejected it, correctly: an update with no target id cannot be carried out.
3. The retry said only "Fix it and reply again". The model could repair the reply by inventing an id or by switching to `create`; it did neither and repeated the answer.
4. After two rejections the step threw, so the user saw an internal error. Nothing was saved, so Logs showed nothing to debug.

**What we changed.**

| Problem | Fix |
| --- | --- |
| The error did not name the valid options | The validator's own message now says what to do instead: "if no listed task is being changed (a new task, even one with a time or date like an existing task), the intent is create". The retry also lists the allowed intents. The message lives in the schema, so every retry carries it. |
| The prompt never covered this confusion | A rule ("a new task is create even when its time looks like an existing task's") and a worked example using this exact case |
| Hard error after two failures | Fall back to `unclear` with a message asking the user to rephrase. The agent is not called, so nothing is changed on a guess. |
| Failures left no trace | Each rejected call is saved with its reason and shown in Logs (`rejected: task_ids: ...`). Fallbacks are also recorded in the Langfuse span metadata. The same marking is used for label and final-reply validation. |

**How it was checked.** Without calling OpenAI, a local fake model server was pointed at the app. When the fake always returned the bad answer, the user got the rephrase message, no task was created, and Logs listed both rejected calls. When it returned the right answer only after seeing the improved retry message, the task was created. This proves the plumbing, not the real model: whether `gpt-5-nano` now classifies this sentence as `create` is not tested yet, and the cheapest next step is to run the sentence for real.

**A later change that removes the cause.** The failure came from asking the intent model to do two jobs: classify the request and point at a task. A follow-up split them. The intent step now sees only the request and no task list, so "tonight at 8pm" has nothing to be confused with. A separate identify step, which runs only for update and delete, picks the task from an index of short summaries and labels, and its own validation rejects any id that is not in the index. Splitting a job in two let each step have a narrower prompt and its own check.

## Gotchas

- A schema guarantees shape, not truth. Put business rules in a validator and keep them in one place.
- A retry that adds no information is mostly wasted money. Say what was wrong and what the valid options are.
- Asking the same small model to correct itself has a low success rate. Better feedback helps; a stronger model for the retry is another option.
- Fail closed (do nothing) when the step guards an action, but fail kindly: a question to the user, not a stack message.
- Save failed attempts. An error you cannot replay is an error you cannot fix.

## Revise

Questions to answer from memory when coming back to this note.

1. What does a strict JSON schema guarantee, and what does it not?
2. Give two rules in this app that only a validator, not the schema, can enforce.
3. Why did the retry not fix the reply, and what three changes made a retry more likely to work?
4. Why does the intent step fall back to `unclear` instead of retrying forever or guessing `create`?
5. What was the root cause behind the failure, and how did a later change remove it instead of patching it?
6. What evidence was missing when diagnosing the failure, and what was changed so it exists next time?
7. What does the fake-model test prove, and what does it leave open?

## See also

- App: [Task manager](../../apps/task-manager/README.md) (the "Known failure cases" section)
- Diagram: none yet
- Sources: [intent.ts](../../apps/task-manager/server/intent.ts), [labels.ts](../../apps/task-manager/server/labels.ts)
- Related: [Function calls and tool-call errors](../agents/tool-call-errors.md), the same idea of useful error text applied to tools
