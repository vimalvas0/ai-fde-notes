# Token usage tracker

A small CLI that asks an OpenAI model a question on behalf of a named user and tracks the input and output tokens in two places: a local file you can query from code, and Langfuse, where you can see it on a dashboard.

Related note: [Tokens, tokenization and the context window](../../notes/fundamentals/tokens-and-context-window.md) — this app is the "track token cost per request" practice from that note.

## Setup

Needs Node 22.18 or newer (it runs the TypeScript files directly, with no build step).

```bash
npm install
```

Copy `.env.example` to `.env` in this folder and fill it in:

| Variable | Needed | What it is |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Your OpenAI key |
| `OPENAI_MODEL` | No | Model to call; defaults to `gpt-5-mini` |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | No | API keys of a Langfuse project. Without them, usage is stored locally only |
| `LANGFUSE_BASE_URL` | No | `https://cloud.langfuse.com` (EU) or `https://us.cloud.langfuse.com` (US) |

## Run

Ask a question as a user:

```bash
npm run ask alice "What is a token?"
```

```
A token is a piece of text ...

This request: 12 input + 30 output = 42 tokens
alice so far:  12 input + 30 output = 42 tokens over 1 request(s)
Sent to Langfuse.
```

Check the stored usage:

```bash
npm run usage
```

```bash
npm run usage alice
```

```bash
npm run usage alice -- --json
```

The first shows totals per user, the second lists every request by one user, and `--json` prints the same data for another program to read.

## Where the usage goes

```
npm run ask alice "..."
        │
        ▼
  OpenAI response ── usage: { prompt_tokens, completion_tokens, total_tokens }
        │
        ├──► data/usage.jsonl   one line per request   ──► npm run usage / getUsage()
        │
        └──► Langfuse trace     tagged userId = alice  ──► Langfuse dashboard
```

**Programmatically.** [src/store.ts](src/store.ts) exports the functions the `usage` command is built on:

```ts
import { getUsage, getUsageByUser, sumUsage } from "./store.ts";

getUsage("alice");            // every stored request by alice
sumUsage(getUsage("alice"));  // { requests, inputTokens, outputTokens, totalTokens }
getUsageByUser();             // totals for every user
```

**On the Langfuse dashboard.** After a request, open your project in Langfuse:

- **Tracing** — one trace named `ask` per request, containing the OpenAI call with its input, output, model and token counts.
- **Users** — one row per user name you passed, with their total tokens and cost.
- **Dashboard** — token usage and cost over time, by model and by user.

Each stored record also keeps the Langfuse `traceId`, so a line in the local file can be matched to its trace.

## What to look at

- [src/ask.ts](src/ask.ts) — the whole flow: call the model, read `completion.usage`, store it, tag the trace with the user.
- [src/langfuse.ts](src/langfuse.ts) — the Langfuse setup, and why a short-lived process must flush before it exits.
- [src/store.ts](src/store.ts) — the local store and the query functions.

## Things to try

- Ask the same question with a one-word prompt and a long one, and compare input tokens.
- Ask for "one sentence" versus "a detailed essay", and compare output tokens.
- Set `OPENAI_MODEL` to a reasoning model and look at `reasoningTokens` in `npm run usage <user> -- --json`: output tokens you pay for but never see.
- Compare the totals from `npm run usage` with the Users page in Langfuse; they should match.

## Limits

- The local store is a plain file, which is fine for a demo but not for concurrent writers. A real app would use a database.
- Only tokens are stored locally, not cost. Langfuse works out cost from its own model price list.
