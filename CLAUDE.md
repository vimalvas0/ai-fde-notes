# ai-fde-notes

A learning repo about LLMs: markdown notes, small runnable apps, and Excalidraw diagrams. It is meant to be read and revised from, not contributed to — optimise for clarity on a re-read, not completeness.

## Layout

- `README.md` — the index of everything in the repo, written for readers. It lists notes, diagrams and apps and nothing else: no setup, layout or how-to-add sections.
- `notes/<topic>/<slug>.md` — one concept per file, from `templates/note.md`.
- `apps/<slug>/` — self-contained app with its own dependencies and `README.md` (from `templates/demo-README.md`).
- `diagrams/<topic>/<slug>.excalidraw` plus an exported `<slug>.svg` (or image) beside it. Start from `templates/blank.excalidraw`.

Topic folders in use or planned: `fundamentals`, `prompting`, `rag`, `agents`, `evals`, `fine-tuning`, `production`.

## Rules

- Names are `kebab-case`. A note, its app and its diagram share the same topic folder and slug.
- When adding a note, app or diagram, add its row to the matching table in `README.md` and cross-link note ↔ app ↔ diagram.
- Apps stay small: one idea each, minimal dependencies, runnable with a single command stated in the app's README. Python apps use `uv`; Node apps use `npm` and keep their own `.env.example`.
- Apps read keys from `.env`; never hardcode or commit keys. New keys get a line in `.env.example`.
- Notes explain the mechanism in plain words first, then show a concrete example. Keep the "Revise" questions section filled in.
- `.excalidraw` files are JSON and can be written directly; an `.svg` export still has to be produced from Excalidraw itself, so say so when one is missing.
