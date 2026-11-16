# ai-fde-notes

Personal notes, small demos and diagrams for learning and revising how LLMs work and how to build with them.

## Layout

| Folder | What goes here |
| --- | --- |
| [notes/](notes/) | Markdown notes, one concept per file, grouped by topic |
| [demos/](demos/) | Small runnable apps, each in its own self-contained folder |
| [diagrams/](diagrams/) | Excalidraw sources (`.excalidraw`) and their exported `.svg`/`.png` |
| [templates/](templates/) | Starting points for a new note, demo or diagram |

## Start here

- [LLM architecture basics](notes/fundamentals/architecture-basics.md) — how an LLM works in ten steps, from training data to generated tokens

The full list of notes is in [notes/README.md](notes/README.md).

## Adding things

**A note** — copy [templates/note.md](templates/note.md) to `notes/<topic>/<slug>.md` and add a line for it in [notes/README.md](notes/README.md).

**A demo** — create `demos/<slug>/`, copy [templates/demo-README.md](templates/demo-README.md) in as `README.md`, and keep the demo's dependencies inside that folder (`uv init` for Python, `npm init` for Node). Add a line in [demos/README.md](demos/README.md).

**A diagram** — copy [templates/blank.excalidraw](templates/blank.excalidraw) to `diagrams/<topic>/<slug>.excalidraw`, edit it, and export an `.svg` with the same name next to it so notes can embed it:

```markdown
![Attention flow](../../diagrams/transformers/attention-flow.svg)
```

## Conventions

- File and folder names are `kebab-case`.
- Notes, demos and diagrams about the same thing share the same topic folder name and slug, so they are easy to find from each other.
- Notes link to the demo and diagram that illustrate them; demos link back to the note that explains them.
- API keys live in a `.env` file (ignored by git). See [.env.example](.env.example).

## Editing diagrams

Install the recommended VS Code extension (Excalidraw) to open `.excalidraw` files in the editor, or drag the file into <https://excalidraw.com>.
