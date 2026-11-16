# ai-fde-notes

A personal learning repo about LLMs: markdown notes, small runnable demos, and Excalidraw diagrams. The reader is the author, revising later — optimise for clarity on a re-read, not completeness.

## Layout

- `notes/<topic>/<slug>.md` — one concept per file, from `templates/note.md`. Indexed in `notes/README.md`.
- `demos/<slug>/` — self-contained app with its own dependencies and `README.md` (from `templates/demo-README.md`). Indexed in `demos/README.md`.
- `diagrams/<topic>/<slug>.excalidraw` plus an exported `<slug>.svg` beside it.

## Rules

- Names are `kebab-case`. A note, its demo and its diagram share the same slug.
- When adding a note or demo, add its line to the matching index README and cross-link note ↔ demo ↔ diagram.
- Demos stay small: one idea each, minimal dependencies, runnable with a single command stated in the demo's README. Python demos use `uv`; Node demos use `npm`.
- Demos read keys from `.env`; never hardcode or commit keys. New keys get a line in `.env.example`.
- Notes explain the mechanism in plain words first, then show a concrete example. Keep the "Revise" questions section filled in.
- `.excalidraw` files are JSON and can be written directly; an `.svg` export still has to be produced from Excalidraw itself, so say so when one is missing.
