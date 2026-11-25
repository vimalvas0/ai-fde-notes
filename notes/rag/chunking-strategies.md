# Chunking strategies for RAG

> Chunking decides what one search result can contain, so it limits retrieval quality before the model ever sees a question.

## Why it matters

An embedding model turns a piece of text into one vector. If the piece is too big, the vector is an average of several topics and matches none of them well. If it is too small, the answer is cut in half or loses the context that makes it make sense. The search returns whole chunks, so a chunk is also the most the model gets to read.

## How it works

Documents are split into chunks, each chunk is embedded, and the vectors are stored in a vector database (Qdrant) next to metadata. At question time the question is embedded with the same model and the closest chunks come back.

Two common strategies:

1. **Recursive character split (size + overlap).** Try to cut on paragraph breaks, then lines, then sentences, then words, until each piece fits `chunk_size`. Neighbouring chunks share `overlap` characters, so a sentence on a boundary appears whole in at least one chunk. Works on any text. Does not know about headings, so one chunk can mix two sections.
2. **Structure-aware split (Markdown headings, then a size cap).** Cut at every heading, so a chunk never mixes two sections. A section longer than `chunk_size` is split recursively with overlap. Each chunk keeps its heading path, which can be added in front of the text before embedding. Needs structured input.

Settings that matter:

| Setting | Too small | Too large |
| --- | --- | --- |
| `chunk_size` | Answer split across chunks, little context | Vector blurs several topics, more noise for the model to read |
| `overlap` | Answer on a boundary is lost | Duplicate chunks, bigger index (10 to 20% of the size is typical) |

Metadata to keep on every chunk: source file, heading path, position (`char_start`, `char_end`). Without it you cannot cite a source or check why a chunk was returned.

## Example

The [chunking comparison app](../../apps/chunking-comparison/) indexes this repo's 12 notes and READMEs with four setups (`recursive` at 400, 800 and 1200 characters, `markdown` at 800) using FastEmbed `BAAI/bge-small-en-v1.5` and one Qdrant collection each. It asks 15 fixed questions and scores a hit when a top result is from the right file and the right section.

A chunk from `markdown-800` looks like this in Qdrant:

```json
{ "source": "notes/agents/tool-call-errors.md", "title": "Function calls and tool-call errors",
  "section": "How it works > The model can send wrong arguments",
  "charStart": 2142, "charEnd": 2771, "strategy": "markdown-800", "chunkIndex": 5 }
```

### Results

Not filled in yet. Run `npm run compare` in the app folder, then copy the summary table from its `RESULTS.md` here and write which setup you would pick and why, using the Hit@1, Hit@3 and MRR columns and the questions where setups differ.

## Gotchas

- Characters are not tokens. 800 characters is about 200 tokens. Check the embedding model's token limit.
- Overlap does not fix a chunk that is too big. It only protects boundaries.
- Compare strategies with one embedding model, one question set and one scoring rule, or the numbers say nothing.
- A small question set is noisy. Read the per-question table, not only the averages.
- Tables and code blocks split badly by size alone. Keep them whole if you can.

## Revise

Questions to answer from memory when coming back to this note.

1. Why does a chunk that is too large lower retrieval quality, even if it contains the answer?
2. What does overlap protect against, and what does it cost?
3. How does the recursive splitter choose where to cut?
4. When is a structure-aware split better than a fixed-size one, and when is it not possible?
5. Which metadata do you store with each chunk, and what is each field for?
6. How are Hit@3 and MRR different?

## See also

- App: [Chunking comparison](../../apps/chunking-comparison/)
- Diagram: none yet
- Sources: Qdrant docs (FastEmbed, collections); `langchain-text-splitters` docs (`RecursiveCharacterTextSplitter`)
