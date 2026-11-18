# Prompting workshop

A hit-and-trial workshop for prompting. You edit a prompt in one TypeScript file, rerun, and see how the same inputs behave under zero-shot, one-shot and few-shot prompts, side by side.

Related note: [System, user and assistant roles](../../notes/prompting/system-user-assistant-roles.md) — examples are sent as earlier `user` / `assistant` message pairs.

## Setup

Needs Node 22.18 or newer (it runs the TypeScript files directly, with no build step).

```bash
npm install
```

Copy `.env.example` to `.env` in this folder and set `OPENAI_API_KEY` (`OPENAI_MODEL` is optional, default `gpt-5-mini`).

## Run

```bash
npm run shots
```

```
• I was billed after the app crashed during checkout.
    zero  → bug
    one   → billing
    few   → billing
    (modes disagree)
```

Run your own script from a plain text file, with no code edits:

```bash
npm run shots -- --file prompts/extract-date.txt
```

Only some modes, or a temperature (not every model accepts one):

```bash
npm run shots -- zero few
```

```bash
npm run shots -- --temperature 0.9
```

## Script files

A script file defines the task, examples and inputs. Sections start with `@task`, `@example` or `@input` on their own line; an example is its input, a line with only `=>`, then its output. Every `@input` is one test (it can span lines), and a file can have zero examples. See [prompts/](prompts/) for two samples, and copy one to start your own:

```
@task
Reply with the capital city only.

@example
France
=>
Paris

@input
Australia
```

Without `--file`, the built-in blocks at the top of `src/shots.ts` are used.

## The three modes

| Mode | Messages sent |
| --- | --- |
| zero-shot | system instruction, then the input |
| one-shot | system instruction, the first example as a user/assistant pair, then the input |
| few-shot | system instruction, every example as user/assistant pairs, then the input |

## What to look at

- [src/shots.ts](src/shots.ts) — the three blocks at the top (`TASK`, `EXAMPLES`, `INPUTS`) are the built-in workshop; the runner below them is plain.
- [prompts/](prompts/) — sample script files.
- The "modes disagree" lines: that is where the examples changed the answer.
- The average input tokens per mode: examples are resent on every call, so they have a price.

## Things to try

- Delete "Reply with the label only" from `TASK`. Which modes still answer with a bare label?
- Change `TASK` to something vaguer ("sort this message"). How much do the examples rescue?
- Reorder `EXAMPLES`, or make the first one an odd case, and watch one-shot change.
- Give the examples a wrong or conflicting label. Does few-shot follow the examples or the instruction?
- Put four examples of one label and one of another. Does the answer lean toward the common one?
- Swap the whole task, such as extracting a date as JSON or rewriting in a style, where format matters more than meaning.
- Run with `--temperature 0.9` a few times and see which mode is steadiest.

## Limits

- One run is one sample. Rerun before concluding anything, especially with a temperature set.
- Six inputs is a feel for the effect, not an evaluation.
