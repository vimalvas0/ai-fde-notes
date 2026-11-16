# Tokens, tokenization and the context window

> Models read and write tokens, not words. Tokens are the unit you are billed in, the unit the context window is measured in, and the unit that sets latency — so most cost and quality decisions come down to token arithmetic.

## Tokens and tokenization

- A **token** is one entry in a model's fixed vocabulary, identified by a number (its token ID). It can be a whole word (`hello`), part of a word (`play` + `ing`), a punctuation mark, or a space plus a word (` cat`). It is neither a word nor a character.
- A **tokenizer** turns text into a list of token IDs and back.
- Most tokenizers split text into **subwords**. The most common method is **BPE** (byte-pair encoding):
  1. Start from small units — bytes or characters, depending on the tokenizer.
  2. Find the neighbouring pair that occurs most often and merge it into a new token.
  3. Repeat until the vocabulary reaches its target size.

  Common words end up as one token; rare words are split into several. Other methods exist (WordPiece, SentencePiece), but the idea is the same.
- Every model family has its own tokenizer, so the same text gives **different token counts on different models**.
- What costs more tokens than you expect: code, JSON (every brace and quote), long numbers and IDs, URLs and file paths, rare names, and languages the tokenizer saw less of in training.

## The context window

The context window is the maximum number of tokens the model can handle in one request — **everything it reads plus everything it writes**.

```
system prompt + tool definitions + chat history + retrieved documents + user message + output  ≤  context window
```

- **The model call is stateless.** The model keeps nothing from one request to the next; the application keeps the conversation and sends the relevant history again each turn. Some platforms offer stored conversations or "memory", but those work the same way underneath: the saved text is put back into the context, and it still takes up tokens.
- **Input and output share the window.** Output also has its own, smaller cap (max output tokens), so that much space must be left free.
- **A bigger window is not a free win.** Loosely relevant text adds noise, details in the middle of a long prompt are the easiest to miss, and more input costs more and takes longer. The aim is the most relevant context, not the most context.

## The math

Prices and limits below are made up for the examples; look up the real ones for the model you use.

### Size estimates (English text)

| Rule of thumb | Value |
| --- | --- |
| 1 token | ≈ 4 characters ≈ ¾ of a word |
| 100 tokens | ≈ 75 words |
| 1 page (~500 words) | ≈ 650–700 tokens |

These are estimates only. For anything that matters, count with the provider's own token counter.

### Context budget

```
space for history and documents = window − reserved output − system prompt − tool definitions
```

Example: 200,000 window − 8,000 output − 2,000 system − 3,000 tools = **187,000 tokens** left for history and documents.

### Cost per request

```
cost = input tokens × input price + output tokens × output price
```

Example at $3 per million input and $15 per million output:

- 10,000 input + 1,000 output = $0.030 + $0.015 = **$0.045** per request
- at 100,000 requests a day = **$4,500 a day**

Output tokens usually cost several times more than input tokens, so cutting unneeded output saves the most. Real price lists often have more categories, such as a lower price for cached input.

### Chat history: the conversation grows linearly, the bill grows quadratically

If the whole history is resent every turn, request 1 carries 1 turn, request 2 carries 2 turns, and request `n` carries `n` turns. With about `t` tokens per turn:

```
conversation length          = t × n
total input billed, all turns = t × (1 + 2 + … + n) = t × n × (n + 1) / 2
```

Example: 20 turns of 500 tokens is a **10,000-token** conversation, but you pay for 500 × 210 = **105,000 input tokens** across its 20 requests.

This is why long conversations need trimming, summarising or retrieval. Prompt caching makes the repeated part cheaper but does not reduce how many tokens are sent.

### Latency

```
response time ≈ time to first token + output tokens ÷ tokens per second
```

Output is generated one token at a time, so a long answer is slow no matter how short the prompt was. Example: 0.5 s + 600 tokens ÷ 60 tokens/s = **10.5 s**.

This is a simplified model: a very long input raises the time to first token, and network and queueing add to it.

## Best practices

**When building an LLM app**

| Practice | Why | Tools |
| --- | --- | --- |
| Track token usage per request and per feature | You cannot cut what you do not measure | Langfuse, Helicone |
| Keep the stable part of the prompt (system prompt, tools, long documents) first and unchanged | Lets the provider's prompt cache reuse it — see the note below | Provider prompt caching, Redis |
| Trim or summarise chat history | Stops the quadratic growth above | Redis, Mem0 |
| Retrieve, don't stuff (RAG) | Send only the passages that matter instead of whole documents | pgvector, Qdrant, LlamaIndex |
| Route easy requests to cheaper models | Most requests do not need the largest model | LiteLLM, OpenRouter |
| Use structured output and cap max output tokens | Output is the expensive, slow side; a schema keeps it short and parseable | Vercel AI SDK + Zod |

**Prompt caching note.** Provider caches match on the **start** of the prompt: everything up to the first difference can be reused, and nothing after it. So a timestamp or user name at the top of the system prompt defeats the cache for the whole request. The rules differ by provider — minimum cacheable length, how long an entry lives, whether you must mark what to cache, and how big the discount is.

**When using a coding assistant**

| Practice | Why |
| --- | --- |
| One task per session (`/clear`, `/compact`) | Old, unrelated context costs tokens and lowers answer quality |
| Keep the project context file (`CLAUDE.md`, `AGENTS.md`) short | It is loaded into every session, so every line is paid for every time |
| Point at the relevant files, not the whole repository | Less noise, and less of the window spent on code that does not matter |

## Revise

Answer from memory before looking back.

**Concepts**

1. What is a token, and why is it wrong to treat tokens and words as the same thing?
2. How does BPE build its vocabulary?
3. Why can the same paragraph have different token counts on two models?
4. What counts toward the context window besides the user's message?
5. If the model call is stateless, how does a chatbot "remember" earlier turns?
6. Why can a model with a larger context window still give a worse answer on a very long prompt?

**Calculations**

7. A model has a 128,000-token window. You reserve 4,000 for output and use 2,000 for the system prompt and tools. How much is left for history and documents?
8. A request has 20,000 input and 2,000 output tokens, at $2 per million input and $10 per million output. What does it cost?
9. A 30-turn chat averages 400 tokens per turn and resends the full history each time. How long is the conversation, and how many input tokens are billed in total?
10. A model's time to first token is 0.8 s and it generates 45 tokens per second. How long does a 900-token answer take?

<details>
<summary>Answers to 7–10</summary>

7. 128,000 − 4,000 − 2,000 = **122,000 tokens**
8. $0.04 + $0.02 = **$0.06**
9. Conversation: 30 × 400 = **12,000 tokens**. Billed: 400 × 30 × 31 / 2 = **186,000 input tokens**
10. 0.8 + 900 ÷ 45 = **20.8 s**

</details>

**Engineering judgment**

11. Why must the stable part of the prompt come first for prompt caching to work?
12. When is summarising old history better than simply cutting it off?
13. Output costs five times as much as input. What would you change first to cut cost?
14. Average input tokens per request keep climbing as conversations get longer. What would you change in the design?

## See also

- App: [Token usage tracker](../../apps/token-usage-tracker/) — tracks input and output tokens per user, locally and in Langfuse
- [LLM architecture basics](architecture-basics.md) — where tokenization sits in the full pipeline (step 2) and why generation is one token at a time (step 10)
- [Temperature and output generation parameters](temperature-and-sampling-parameters.md) — max output tokens, and how the next token is chosen
