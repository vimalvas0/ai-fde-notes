# ai-fde-notes

Notes, small apps and diagrams for learning and revising how LLMs work and how to build with them. Each note is short, covers one concept, and ends with questions to test yourself.

## Notes

### Fundamentals

| Note | What it covers |
| --- | --- |
| [LLM architecture basics](notes/fundamentals/architecture-basics.md) | How an LLM works in ten steps, from training data to generated tokens |
| [Tokens, tokenization and the context window](notes/fundamentals/tokens-and-context-window.md) | What tokens are, the math for size, cost and latency, and best practices for keeping token use down |
| [Temperature and output generation parameters](notes/fundamentals/temperature-and-sampling-parameters.md) | How the next token is picked: temperature, top-k, top-p, max tokens, stop sequences and penalties, with the softmax math |

### Prompting

| Note | What it covers |
| --- | --- |
| [System, user and assistant roles](notes/prompting/system-user-assistant-roles.md) | What each message role is for, the instruction hierarchy, and how roles carry a stateless conversation |

### Agents

| Note | What it covers |
| --- | --- |
| [Function calls and tool-call errors](notes/agents/tool-call-errors.md) | How a function call works, the kinds of tool errors (5xx, 4xx, not found, empty, policy block), wrong arguments from the model, and who should handle each |

## Diagrams

| Diagram | Used in |
| --- | --- |
| [How an LLM works in 10 steps](diagrams/fundamentals/architecture-basics.webp) | [LLM architecture basics](notes/fundamentals/architecture-basics.md) |

## Apps

| App | What it shows |
| --- | --- |
| [LiteLLM gateway](apps/README.md) | One local address that routes requests to OpenAI or Anthropic models by name, run with Docker Compose |
| [Model router](apps/model-router/) | A routing pipeline (a small model judges the prompt, then the answer with fallback) that sends each prompt to a cheap or strong model through the LiteLLM gateway, traced in Langfuse; also a function-call demo with failing tools (5xx, 4xx, empty result, policy block) you can try with your own prompts (TypeScript) |
| [Prompting workshop](apps/prompting-workshop/) | Chat for up to 10 turns under a script system prompt loaded from a text file, behind a hard prompt that keeps replies short; the app classifies the script as zero-, one- or few-shot (TypeScript) |
| [Token usage tracker](apps/token-usage-tracker/) | Tracking input and output tokens per user, stored locally and sent to Langfuse; also a system-prompt demo that returns short JSON about a TV series (TypeScript) |
