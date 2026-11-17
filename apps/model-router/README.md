# Model router

A small CLI that decides which model should answer a prompt. A small, fast model first judges how hard the prompt is. Easy questions then go to a cheap model and hard ones to a stronger model, and if a model fails the next one is tried. It runs on the [LiteLLM gateway](../README.md), so each model is just a name, and every step shows up as one trace in Langfuse.

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
  → simple → claude-haiku   (claude-haiku said simple)
```

Route and answer one prompt:

```bash
npm run route "Compare REST and GraphQL for a mobile app"
```

Only show the route, with no answer:

```bash
npm run route -- --dry "What is the capital of France?"
```

## Function calls and failing tools

A second script, `src/tools-demo.ts`, is for learning function calls: how they look in Langfuse and what to do when the tool fails.

```bash
npm run tools            # all scenarios
npm run tools -- 404     # one scenario (part of its name is enough)
```

The model never runs a tool. It only replies "call `get_order` with these arguments"; our code runs it and sends the result back as a message, and the model writes the answer from that. So when a tool fails, the result message is the only way the model finds out. The script starts a small fake HTTP API inside itself (no setup) and asks a question per failure:

| Scenario | What the API does | What happens |
| --- | --- | --- |
| `success` | 200 | Baseline: tool call, tool result, answer |
| `404-not-found` | 404 | Not retryable. The model says the order does not exist and asks the user to check, instead of inventing one |
| `400-bad-input` | 400, "id must look like ORD-1234" | The model sent `1001`, reads the error message, fixes the argument and calls again |
| `empty-result` | 200 with an empty list | Not an error: the model says there is nothing there |
| `503-recovers` | 503 twice, then 200 | The tool retries with a growing wait; the model never sees the failure |
| `500-gives-up` | 500 every time | Retries run out, the model is told `retryable: true`, and reports the outage while still sharing what it did find |
| `429-rate-limit` | 429 with `Retry-After` | The tool waits as long as the API says, then succeeds |

The rules the script follows:

- **Retry in code, not in the model**, for errors that can go away by themselves (5xx, 429, no response). The model only hears about them once retries are used up. Retrying 4xx does not help, because the request itself is wrong.
- **Every failure returns the same JSON shape** (`ok`, `kind`, `status`, `message`, `retryable`), so the model can tell "fix your arguments" from "try later" without reading prose.
- **A tool never throws.** Every call gets a reply, even a failed one, or the next request to the model is rejected.
- **Empty is not an error.** A 200 with no rows is `ok: true`, and the system prompt says so.
- **Tell the model not to guess.** The system prompt says what to do for each case; without it a model may fill a failed lookup with plausible data.

In Langfuse, each scenario is a trace `tool-calls: <scenario>`: a generation whose output is the tool call, a `tool` observation (input: the arguments, output: exactly what the model sees), one `http-attempt` span inside it per try, then a second generation that reads the result. Failed tries and failed tools are marked red (level `ERROR`) with the status in the message. Compare `503-recovers` (red attempts, green tool) with `500-gives-up` (red all the way up).

## How the pipeline works

```
prompt ──► classify ──► answer
           small, fast   chosen model, tries each model
           model judges  in the tier's list until one works
           the prompt
```

1. **Classify.** A small, fast model (`claude-haiku`) reads the prompt and replies with one word, `simple` or `complex`. This is a model's judgement instead of hand-written word and length checks, so it can tell that a short question is hard or a long one is easy. If the reply is not `simple`, or the call fails, the prompt is treated as complex, the safer choice.
2. **Answer** calls the first model for that tier. If it fails, the next one in the list is tried.

Each stage is a span inside one Langfuse trace named `model-router`. The trace's metadata holds the verdict, the reason, the model that answered and any models that failed.

**The trade-off.** Every prompt now pays for one tiny classifier call (a few dozen input tokens and about one output token) and a little extra delay before the real answer starts. In return the routing is not tied to a fixed list of words.

## What to look at

- [src/pipeline.ts](src/pipeline.ts) — the stages and the loop that runs them. Adding a stage means adding one object to the `STAGES` list.
- [src/models.ts](src/models.ts) — which models serve each tier. Change the routing here.
- [src/route.ts](src/route.ts) — the command-line entry point.
- [src/tools-demo.ts](src/tools-demo.ts) — the function-call scenarios above: fake API, retrying tool runner, and the model loop.

## Things to try

- Run `npm run demo`, then edit the samples in `src/demo.ts` to find prompts the classifier gets wrong.
- Change `CLASSIFIER_PROMPT` in `src/pipeline.ts` (for example, what counts as simple) and see how the routes shift.
- Change the tiers in `src/models.ts`, for example put `gpt-5-mini` first for simple prompts, and compare answers.
- Stop the gateway's access to one provider (remove its key and restart) and watch the fallback move to the next model.
- In Langfuse, open a `model-router` trace and look at the `classify` step: its input is the prompt and its output is the verdict.

## Limits

- The classifier is a model too, so it can be wrong, and the same prompt may occasionally get a different verdict.
- Every prompt, even `--dry`, needs the gateway and the classifier model to be reachable. If the call fails, the prompt goes to the strong model.
- The classifier's reply counts as *simple* only if it starts with that word; anything else is treated as complex. Its token cost shows in Langfuse but is not added to the answer's totals printed in the terminal.
- Model names must exist in `apps/litellm-config.yaml`, and they change over time.
- Answers are capped at 2,000 tokens (`MAX_ANSWER_TOKENS` in `src/pipeline.ts`).
