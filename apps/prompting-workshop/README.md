# Prompting workshop

A hit-and-trial workshop for prompting. You write a **script system prompt** in a plain text file, the app tells you whether it is zero-shot, one-shot or few-shot, and then you chat with the model under it for up to 10 turns.

Related note: [System, user and assistant roles](../../notes/prompting/system-user-assistant-roles.md) — the script is a system prompt, and the chat is the user/assistant turns around it.

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
| `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` | No | API keys of a Langfuse project. Without them, nothing is traced |
| `LANGFUSE_BASE_URL` | No | `https://cloud.langfuse.com` (EU) or `https://us.cloud.langfuse.com` (US) |

## Run

```bash
npm run chat prompts/ticket-classifier.txt
```

```
model: gpt-5-mini   script: prompts/ticket-classifier.txt
script type: few-shot (3 example(s)) — Three message/label pairs are given.
Chat up to 10 turns. Type /quit to stop.

you [1/10]> I was billed after the app crashed
model> billing
       (210 in / 3 out)
```

Write your own script as any text file and point the command at it. The sample scripts in [prompts/](prompts/) are one per type:

| File | Type |
| --- | --- |
| `pirate-support.txt` | zero-shot: instructions only |
| `capital-city.txt` | one-shot: one worked example |
| `ticket-classifier.txt` | few-shot: three worked examples |

## How it is built

```
system message = HARD system prompt  +  your script file
then: user, assistant, user, assistant ... (up to 10 user turns)
```

- **Hard system prompt** (in [src/chat.ts](src/chat.ts), not editable from the script): keeps every reply under 40 words with no preamble, so the chat uses few output tokens.
- **Script system prompt**: your text file, placed after the hard rules.
- **Classifier**: before the chat, one small model call reads the script and says zero-, one- or few-shot by counting worked examples.
- **Turn limit**: `MAX_TURNS = 10`. Each reply shows its input and output tokens, and a total is printed at the end.

## Tracing in Langfuse

With the Langfuse keys set, the run prints `Langfuse session: workshop-...` and traces everything:

- **Sessions** — one session per run, so the whole chat reads as one conversation. Search for the printed id.
- **Tracing** — a `classify-script` trace, then one `chat-turn` trace per turn, each with the OpenAI call under it (full messages including the hard prompt, output, model, token counts).
- **Tags and metadata** — each trace is tagged `prompting-workshop` and the script type (`few-shot` etc.), and carries the script file name, so you can filter runs of different scripts and compare their tokens and cost.

## What to look at

- Input tokens grow every turn, because the whole history is resent (the model is stateless).
- Output tokens stay small because of the hard prompt.
- Whether the classifier agrees with what you intended.
- In Langfuse, the growing input tokens per turn, and the same chat under a zero-shot and a few-shot script side by side.

## Things to try

- Chat with `pirate-support.txt` and then `ticket-classifier.txt`. Which one stays in format when you go off topic?
- Remove two examples from `ticket-classifier.txt` so it becomes one-shot, then zero-shot. Where does the label format start to slip?
- Make the examples contradict the instruction ("reply with the label only" but an example gives a sentence). Which does the model follow?
- Ask the script to break the hard rule ("write a long essay"). Which prompt wins?
- Write an example inside prose, not as input/output pairs, and see how the classifier counts it.

## Limits

- Classification is done by a model, so it can be wrong on odd formats; rerun to check.
- One chat is one sample. Rerun before concluding anything.
