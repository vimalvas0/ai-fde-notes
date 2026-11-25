# Chunking comparison

Chunks the repo's own notes and app READMEs in several ways, embeds every setup with the same local model, stores each in its own Qdrant collection, and asks 15 fixed questions to see which setup finds the right passage most often. Node + TypeScript.

Related note: [Chunking strategies for RAG](../../notes/rag/chunking-strategies.md)

## Run

Needs Node 22.18 or newer and Docker. No API key: the embedding model (FastEmbed `BAAI/bge-small-en-v1.5`, about 70 MB, downloaded on first run) runs on your machine.

Start Qdrant (data is kept in the `qdrant_storage` volume):

```bash
docker run -d --name qdrant -p 6333:6333 -v qdrant_storage:/qdrant/storage qdrant/qdrant
```

```bash
npm install
npm run compare
```

This writes `RESULTS.md`: one summary row per setup, then the rank of the first relevant chunk for each question. Set `QDRANT_URL` if Qdrant is not at `http://localhost:6333`.

To only check the chunking and that every question has an answerable chunk (no model, no Qdrant):

```bash
npm run chunks
```

## Files

| File | What it is |
| --- | --- |
| `src/config.ts` | Embedding model, `TOP_K`, and the list of setups (strategy, `size` and `overlap` in characters) |
| `src/questions.ts` | 15 questions, each with the file and the heading that holds the answer |
| `src/chunking.ts` | The two strategies (`recursive`, `markdown`), built on `@langchain/textsplitters` |
| `src/documents.ts` | Loads the corpus; finds headings, heading paths and section ranges |
| `src/store.ts` | Qdrant: create a collection per setup, upsert points, search |
| `src/scoring.ts` | The relevance rule, ranks, Hit@k and MRR |
| `src/report.ts` | Writes `RESULTS.md` |
| `src/index.ts` | Runs it all |

## What gets stored

One Qdrant collection per setup (`chunks_recursive_800`, ...), 384-dimension cosine vectors. Each point's payload holds `text`, `source` (file path), `title`, `section` (heading path), `chunkIndex`, `charStart`, `charEnd`, `strategy`, `size`, `overlap`. The offsets point at the exact place in the source file.

## How relevance is scored

A chunk is relevant when it is from the expected file and shares at least half of the shorter of (chunk, expected section) with that section. The same rule is used for every strategy, using the stored offsets, so no strategy gets an easier test. Reported: Hit@1/3/5 (a relevant chunk in the top 1/3/5), MRR (1 / rank of the first relevant chunk, averaged), and Source hit@1 (right file, any section).

The `markdown` strategy also puts `title > section` in front of the text it embeds (not in the stored `text`). That is part of what the strategy offers, so it counts in the comparison.

## Things to try

- Change `size` and `overlap` in `src/config.ts` and rerun.
- Set `overlap: 0` for one setup and look for questions whose answer sits on a chunk boundary.
- Add a question of your own to `src/questions.ts`.
- Switch the model to `EmbeddingModel.BGEBaseENV15` (and `VECTOR_SIZE` to 768) and see whether the ranking between strategies changes.

## Limits

- The corpus is 12 short Markdown files and 15 questions, so a one-question difference is noise. Treat gaps under about 0.1 as a tie.
- Sizes are in characters, not tokens. The model reads up to 512 tokens, about 2000 characters, so all setups fit.
- Questions are written by hand against known headings, which favours structure-aware chunking a little. A corpus without headings would not show that gain.
- The collections are dropped and rebuilt on every run.
