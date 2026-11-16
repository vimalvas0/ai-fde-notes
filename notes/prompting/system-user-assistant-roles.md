# System, user and assistant roles

> Every message sent to a chat model carries a **role** (`system`, `user` or `assistant`), and the role tells the model whose words those are and how much weight to give them.

## Why it matters

- The role is how you separate **instructions you control** (the system prompt) from **input you do not control** (the user message). Mixing them in one string is the root of most prompt-injection and "the model ignored my rules" problems.
- It is also how a stateless model "remembers" a conversation: you resend the earlier turns, each tagged with its role.

## How it works

A chat request is not one prompt but an ordered list of messages, each with a `role` and `content`. The model reads the whole list as one sequence of tokens and generates the next assistant message.

| Role | Written by | Job |
| --- | --- | --- |
| `system` | The developer | Sets persona, rules, output format and boundaries. Highest priority, applies to the whole conversation. |
| `user` | The end user (or your code, on their behalf) | The task or question for this turn. |
| `assistant` | The model, or you | The model's earlier replies. You can also write one yourself to show an example or to continue a reply. |

- **Instruction hierarchy.** Models are trained to follow `system` over `user` when they conflict. This is a strong tendency, not a security guarantee — never put secrets in a system prompt, and do not rely on it alone to stop prompt injection.
- **Statelessness.** The API remembers nothing between calls. For turn 3 you send system + user 1 + assistant 1 + user 2 + assistant 2 + user 3. All of it counts as input tokens every time (see [tokens and the context window](../fundamentals/tokens-and-context-window.md)).
- **Provider differences.** Some APIs take the system prompt as a separate top-level field (Anthropic `system`), others as the first message in the list (OpenAI chat completions). Newer OpenAI models call the top role `developer`; it plays the same part. Tool results usually come back under their own `tool` role.

```
┌─ system     "You are a TV librarian. Reply with JSON only."   ← developer, fixed
├─ user       "Breaking Bad"                                     ← end user, per request
└─ assistant  {"title":"Breaking Bad", ...}                      ← model output
```

## Example

Same user message, different system prompt:

```json
[
  { "role": "system", "content": "Reply with one JSON object: title, year, genre. No other text." },
  { "role": "user", "content": "Breaking Bad" }
]
```

The assistant replies `{"title":"Breaking Bad","year":2008,"genre":"Crime drama"}`. Without the system message, the same user text gets a free-form paragraph.

**Few-shot via assistant turns.** Pre-filling a `user` / `assistant` pair teaches the format by demonstration:

```json
[
  { "role": "system", "content": "Classify sentiment as positive or negative." },
  { "role": "user", "content": "Loved it" },
  { "role": "assistant", "content": "positive" },
  { "role": "user", "content": "Waste of time" }
]
```

## Gotchas

- **Treat user content as data, not instructions.** If the user message says "ignore the above", the model may comply. Validate and limit user input in code (length, allowed characters) before it reaches the model.
- **The system prompt is paid for on every request.** A long one inflates input cost and latency; prompt caching helps only when the prefix is identical.
- **Rules at the very start of a long conversation can fade.** Keep the system prompt short and specific, and repeat critical constraints close to the end if needed.
- **Asking for JSON in the system prompt is a request, not a guarantee.** Use the API's JSON or structured-output mode as well, and still parse defensively.
- **Fake assistant turns are trusted.** Anything you place under `assistant` is treated as something the model already said, so do not let user text be inserted there.

## Revise

Questions to answer from memory when coming back to this note.

1. What are the three roles, and who writes each?
2. Why does the application resend earlier `assistant` turns on every request?
3. What does the instruction hierarchy say, and why is it not a security boundary?
4. Where would you put output-format rules, and where the text to analyse? Why?
5. How can `assistant` messages be used to teach a format?
6. Why limit the length of user input in code rather than only in the system prompt?

## See also

- App: [Token usage tracker](../../apps/token-usage-tracker/) — the `movies` command uses a system prompt to force a short JSON reply
- Note: [Tokens, tokenization and the context window](../fundamentals/tokens-and-context-window.md)
- Sources: provider docs on chat message roles (OpenAI "Text generation", Anthropic "System prompts")
