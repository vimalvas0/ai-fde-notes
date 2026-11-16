# Model router

A small CLI that decides which model should answer a prompt. Easy questions go to a cheap, fast model and hard ones to a stronger model, and if a model fails the next one is tried. It runs on the [LiteLLM gateway](../README.md), so each model is just a name, and every step shows up as one trace in Langfuse.

Related notes: [Tokens, tokenization and the context window](../../notes/fundamentals/tokens-and-context-window.md) (the "route easy requests to cheaper models" practice) and [Temperature and output generation parameters](../../notes/fundamentals/temperature-and-sampling-parameters.md).

## Setup

Needs Node 22.18 or newer, and the LiteLLM gateway running (`docker compose up -d` in `apps/`, see [its README](../README.md)).

```bash
npm install
```

Copy `.env.example` to `.env` in this folder and fill it in:

| Variable | Needed | What it is |
| --- | --- | --- |
| `LITELLM_MASTER_KEY` | Yes | The same value as in `apps/.env` |
| `LITELLM_BASE_URL` | No | Where the gateway listens; defaults to `http://localhost:4000/v1` |
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | No | API keys of a Langfuse project. Without them, routing still works but no trace is sent |
| `LANGFUSE_BASE_URL` | No | `https://cloud.langfuse.com` (EU) or `https://us.cloud.langfuse.com` (US) |

## Run

See where a few sample prompts would go, without answering them:

```bash
npm run demo
```

```
What is the capital of France?
  → simple → claude-haiku   (rules: short prompt (6 words), no analysis words)
```

Route and answer one prompt:

```bash
npm run route "Compare REST and GraphQL for a mobile app"
```

Only show the route, with no answer:

```bash
npm run route -- --dry "What is the capital of France?"
```

## How the pipeline works

```
prompt ──► rules ──► classify ──► answer
           free      small model   chosen model
           decides   only if the   tries each model in the
           most      rules cannot  tier's list until one works
```

1. **Rules** look at the text: code or analysis words, or a very long prompt, mean *complex*; a very short prompt with none of those means *simple*. No model call, no cost.
2. **Classify** runs only when the rules could not decide. A small model replies with one word, `simple` or `complex`. If that call fails, the prompt is treated as complex, the safer choice.
3. **Answer** calls the first model for that tier. If it fails, the next one in the list is tried.

Each stage that runs is a span inside one Langfuse trace named `model-router`. The trace's metadata holds the verdict, who decided it, the reason, the model that answered and any models that failed.

## What to look at

- [src/pipeline.ts](src/pipeline.ts) — the stages and the loop that runs them. Adding a stage means adding one object to the `STAGES` list.
- [src/models.ts](src/models.ts) — which models serve each tier. Change the routing here.
- [src/route.ts](src/route.ts) — the command-line entry point.

## Things to try

- Run `npm run demo` and change the words in a sample to see the rules flip the route.
- Change the tiers in `src/models.ts`, for example put `gpt-5-mini` first for simple prompts, and compare answers.
- Stop the gateway's access to one provider (remove its key and restart) and watch the fallback move to the next model.
- In Langfuse, open a `model-router` trace and compare a prompt decided by the rules with one that needed the classifier.

## Limits

- The rules are simple word and length checks, so they will misjudge some prompts. A short question can still be hard, and a long one can be easy.
- The classifier's reply counts as *simple* only if it starts with that word; anything else is treated as complex. Its token cost shows in Langfuse but is not added to the answer's totals printed in the terminal.
- Model names must exist in `apps/litellm-config.yaml`, and they change over time.
- Answers are capped at 2,000 tokens (`MAX_ANSWER_TOKENS` in `src/pipeline.ts`).
