# Tokens, tokenization and the context window

> Models read and write tokens, not words. Tokens are the unit you are billed in, the unit the context window is measured in, and the unit that sets latency — so most cost and quality decisions come down to token arithmetic.

## Tokens and tokenization

- A **token** is a piece of text from a fixed vocabulary: a whole word, part of a word (`play` + `ing`), a punctuation mark, or a space plus a word (` cat`).
- A **tokenizer** turns text into a list of token IDs and back. Most use **BPE** (byte-pair encoding): start from single bytes, then repeatedly merge the most frequent neighbouring pair into a new token until the vocabulary reaches its target size. Common words end up as one token; rare words are split into several.
- Every model family has its own tokenizer, so the same text gives **different token counts on different models**.
- What costs more tokens than you expect: code, JSON (every brace and quote), long numbers and IDs, URLs, rare names, and most non-English text.

## The context window

The context window is the maximum number of tokens the model can handle in one request — **everything it reads plus everything it writes**.

```
system prompt + tool definitions + chat history + retrieved documents + user message + output  ≤  context window
```

- The model has no memory between requests. A "conversation" works only because the whole history is sent again on every turn.
- Output has its own, smaller cap (max output tokens), and that space must be left free inside the window.
- A bigger window is not a free win: answers tend to get worse as the context fills with loosely relevant text, and details in the middle of a long prompt are the easiest to miss.

## The math

Prices below are made up for the examples; look up real prices and limits for the model you use.

**Size estimates (English text)**

| Rule of thumb | Value |
| --- | --- |
| 1 token | ≈ 4 characters ≈ ¾ of a word |
| 100 tokens | ≈ 75 words |
| 1 page (~500 words) | ≈ 650–700 tokens |

These are estimates only. For anything that matters, count with the provider's own token counter.

**Context budget**

```
space for history and documents = window − reserved output − system prompt − tool definitions
```

Example: 200,000 window − 8,000 output − 2,000 system − 3,000 tools = **187,000 tokens** left for history and documents.

**Cost per request**

```
cost = input tokens × input price + output tokens × output price
```

Output tokens usually cost several times more than input tokens. Example at $3 per million input and $15 per million output:

- 10,000 input + 1,000 output = $0.030 + $0.015 = **$0.045** per request
- at 100,000 requests a day = **$4,500 a day**

**Chat history grows quadratically**

Because every turn resends all earlier turns, the input you are billed for grows much faster than the conversation itself. With `n` turns of about `t` tokens each:

```
total input billed ≈ t × n × (n + 1) / 2
```

Example: 20 turns of 500 tokens is a 10,000-token conversation, but you pay for 500 × 210 = **105,000 input tokens** across it.

**Latency**

```
response time ≈ time to first token + output tokens ÷ tokens per second
```

Output is generated one token at a time, so a long answer is slow no matter how short the prompt was. Example: 0.5 s + 600 tokens ÷ 60 tokens/s = **10.5 s**.

## Best practices

**When building an LLM app**

| Practice | Why | Tools |
| --- | --- | --- |
| Track token cost per request and per feature | You cannot cut what you do not measure | Langfuse, Helicone |
| Cache stable prompts — keep the unchanging part (system prompt, tools, long documents) at the start | Cached input is billed at a fraction of the normal price and is faster | Provider prompt caching, Redis |
| Trim or summarise chat history | Stops the quadratic growth above | Redis, Mem0 |
| Retrieve, don't stuff (RAG) | Send only the passages that matter instead of whole documents | pgvector, Qdrant, LlamaIndex |
| Route easy requests to cheaper models | Most requests do not need the largest model | LiteLLM, OpenRouter |
| Use structured output and cap max output tokens | Output is the expensive, slow side; a schema keeps it short and parseable | Vercel AI SDK + Zod |

**When using a coding assistant**

| Practice | Why |
| --- | --- |
| One task per session (`/clear`, `/compact`) | Old, unrelated context costs tokens and lowers answer quality |
| Keep the project context file (`CLAUDE.md`, `AGENTS.md`) short | It is loaded into every session, so every line is paid for every time |

## Revise

1. Why can the same paragraph have different token counts on two models?
2. What counts toward the context window besides the user's message?
3. A 30-turn chat averages 400 tokens per turn. Roughly how many input tokens are billed in total?
4. Why does prompt caching need the stable part of the prompt to come first?
5. Which is usually more expensive and slower per token, input or output, and what does that suggest about prompt design?
6. Why can a model with a larger context window still give a worse answer on a very long prompt?

## See also

- [LLM architecture basics](architecture-basics.md) — where tokenization sits in the full pipeline (step 2) and why generation is one token at a time (step 10)
