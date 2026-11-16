# Demos

Small runnable apps, each showing one idea. Every demo lives in its own folder with its own dependencies and a `README.md` saying what it shows and how to run it. Start from [the demo README template](../templates/demo-README.md).

## Index

Add a line here for each demo as you build it.

<!-- Example:
- [token-counter](token-counter/) — count tokens for a prompt and estimate cost (Python)
-->

## Starting a demo

Python:

```bash
uv init demos/<slug>
```

Node:

```bash
npm init -y --prefix demos/<slug>
```

Keys are read from a `.env` file at the repo root or in the demo folder; never commit one.
