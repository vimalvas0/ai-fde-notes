# ai-fde-notes

Notes, small apps and diagrams for learning and revising how LLMs work and how to build with them. Each note is short, covers one concept, and ends with questions to test yourself.

## Notes

### Fundamentals

| Note | What it covers |
| --- | --- |
| [LLM architecture basics](notes/fundamentals/architecture-basics.md) | How an LLM works in ten steps, from training data to generated tokens |
| [Tokens, tokenization and the context window](notes/fundamentals/tokens-and-context-window.md) | What tokens are, the math for size, cost and latency, and best practices for keeping token use down |

### Prompting

| Note | What it covers |
| --- | --- |
| [System, user and assistant roles](notes/prompting/system-user-assistant-roles.md) | What each message role is for, the instruction hierarchy, and how roles carry a stateless conversation |

## Diagrams

| Diagram | Used in |
| --- | --- |
| [How an LLM works in 10 steps](diagrams/fundamentals/architecture-basics.webp) | [LLM architecture basics](notes/fundamentals/architecture-basics.md) |

## Apps

| App | What it shows |
| --- | --- |
| [Token usage tracker](apps/token-usage-tracker/) | Tracking input and output tokens per user, stored locally and sent to Langfuse; also a system-prompt demo that returns short JSON about a TV series (TypeScript) |
