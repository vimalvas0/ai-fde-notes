# LiteLLM gateway

A small local server that sits between your code and the model providers. Your code talks to it in the OpenAI format, and it forwards the request to OpenAI or Anthropic depending on the model name you ask for. Switching models means changing one word, and each provider's key stays in one place.

Related note: [Temperature and output generation parameters](../notes/fundamentals/temperature-and-sampling-parameters.md) — the same prompt can be sent to different models with different settings through one address.

## Setup

Needs Docker. Copy `.env.example` to `.env` in this folder and fill it in:

| Variable | What it is |
| --- | --- |
| `OPENAI_API_KEY` | Your OpenAI key |
| `ANTHROPIC_API_KEY` | Your Anthropic key |
| `LITELLM_MASTER_KEY` | A password of your choice that your code sends to the gateway |

## Run

```bash
docker compose up -d
```

The gateway is then at `http://localhost:4000`. Check which models it offers:

```bash
curl http://localhost:4000/v1/models -H "Authorization: Bearer $LITELLM_MASTER_KEY"
```

Ask one of them a question. Change `model` to `claude-haiku` or `claude-sonnet` to switch provider:

```bash
curl http://localhost:4000/v1/chat/completions -H "Authorization: Bearer $LITELLM_MASTER_KEY" -H "Content-Type: application/json" -d '{"model":"gpt-5-mini","messages":[{"role":"user","content":"Say hi in five words."}]}'
```

Stop it:

```bash
docker compose down
```

## What to look at

- [litellm-config.yaml](litellm-config.yaml) — the list of models. Each entry maps a short name to a real provider and model.
- [docker-compose.yml](docker-compose.yml) — how the gateway is started and which keys it receives.

## Using it from code

Any OpenAI library works. Point it at the gateway and use the master key as the API key:

```ts
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "http://localhost:4000/v1", apiKey: process.env.LITELLM_MASTER_KEY });
const reply = await client.chat.completions.create({ model: "claude-haiku", messages: [{ role: "user", content: "Hello" }] });
```

## Things to try

- Send the same prompt to all three models and compare the answers and the token counts.
- Add `"temperature": 0` and then `1` to the request body and compare repeated runs.
- Add another model to `litellm-config.yaml`, restart with `docker compose restart`, and call it by its new name.

## Limits

- Model names change over time. If a call fails with "model not found", check the provider's current model list and edit the config.
- The image tag `main-stable` follows the project's latest stable build, so it can change between pulls. Pin an exact version if you need repeatable setups.
- The gateway is for your own machine. It has no user accounts or spending limits set up.
