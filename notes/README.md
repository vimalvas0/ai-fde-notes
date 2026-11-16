# Notes

One concept per file, at `notes/<topic>/<slug>.md`. Start from [the note template](../templates/note.md).

## Index

Add a line here for each note as you write it.

<!-- Example:
### Fundamentals
- [Tokenization](fundamentals/tokenization.md) — how text becomes token ids, and why it matters for cost
-->

## Topic map

Suggested topic folders, to create as you get to them:

- `fundamentals/` — tokens, embeddings, transformers, attention, sampling (temperature, top-p)
- `prompting/` — system prompts, few-shot, structured output, prompt caching
- `rag/` — chunking, embeddings, vector search, reranking, evaluation
- `agents/` — tool use, agent loops, MCP, multi-agent patterns, memory
- `evals/` — test sets, graders, LLM-as-judge, regression tracking
- `fine-tuning/` — when to fine-tune, LoRA, data preparation
- `production/` — latency, cost, rate limits, guardrails, observability
