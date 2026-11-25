/**
 * Chunk the notes several ways, embed each setup with FastEmbed, store it in Qdrant,
 * ask the fixed questions, and write RESULTS.md.
 *
 *   npm run compare   full run (needs Qdrant; downloads the embedding model on first use)
 *   npm run chunks    only chunk and check the questions: no model, no Qdrant
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { EmbeddingModel, FlagEmbedding } from "fastembed";
import { chunkDocs, textToEmbed } from "./chunking.ts";
import { CONFIGS, EMBEDDING_MODEL, TOP_K } from "./config.ts";
import { loadDocs } from "./documents.ts";
import { QUESTIONS } from "./questions.ts";
import { renderReport } from "./report.ts";
import { firstRank, isRelevant, resolveQuestions, summarize } from "./scoring.ts";
import { search, storeChunks } from "./store.ts";
import type { ChunkConfig, Doc, ResolvedQuestion, Summary } from "./types.ts";

const RESULTS_FILE = path.resolve(import.meta.dirname, "../RESULTS.md");
const EMBED_BATCH = 32;

async function main() {
  const docs = loadDocs();
  const questions = resolveQuestions(QUESTIONS, docs);
  console.log(`${docs.length} documents, ${questions.length} questions, ${CONFIGS.length} configs`);

  if (process.argv.includes("--chunks-only")) await checkChunks(docs, questions);
  else await compare(docs, questions);
}

/** Chunking only: sizes, and whether every question has a chunk that could answer it. */
async function checkChunks(docs: Doc[], questions: ResolvedQuestion[]) {
  for (const config of CONFIGS) {
    const chunks = await chunkDocs(docs, config);
    const answerable = questions.filter((q) => chunks.some((c) => isRelevant(c, q))).length;
    const longest = Math.max(...chunks.map((c) => c.text.length));
    const avg = Math.round(chunks.reduce((sum, c) => sum + c.text.length, 0) / chunks.length);
    console.log(
      `${config.name.padEnd(16)} ${chunks.length} chunks, avg ${avg} chars, longest ${longest}, ` +
        `answerable questions ${answerable}/${questions.length}`,
    );
  }
}

async function compare(docs: Doc[], questions: ResolvedQuestion[]) {
  const model = await FlagEmbedding.init({ model: EMBEDDING_MODEL as Exclude<EmbeddingModel, EmbeddingModel.CUSTOM> });
  const queryVectors = await Promise.all(questions.map((q) => model.queryEmbed(q.q)));

  const summaries: Summary[] = [];
  const ranks: Record<string, (number | undefined)[]> = {};

  for (const config of CONFIGS) {
    const chunks = await chunkDocs(docs, config);
    const vectors = await embedAll(model, chunks.map((c) => textToEmbed(c, config)));
    await storeChunks(config, chunks, vectors);

    const { relevantRanks, sourceRanks } = await runQuestions(config, questions, queryVectors);
    ranks[config.name] = relevantRanks;
    const summary = summarize(config.name, chunks, relevantRanks, sourceRanks);
    summaries.push(summary);
    console.log(
      `${config.name.padEnd(16)} chunks=${summary.chunks} hit@1=${summary.hit1.toFixed(2)} ` +
        `hit@3=${summary.hit3.toFixed(2)} mrr=${summary.mrr.toFixed(3)}`,
    );
  }

  writeFileSync(RESULTS_FILE, renderReport(summaries, ranks, questions));
  console.log(`wrote ${RESULTS_FILE}`);
}

async function embedAll(model: FlagEmbedding, texts: string[]): Promise<number[][]> {
  const vectors: number[][] = [];
  for await (const batch of model.passageEmbed(texts, EMBED_BATCH)) vectors.push(...batch);
  return vectors;
}

/** Search every question; return the rank of the first relevant chunk and of the first chunk from the right file. */
async function runQuestions(config: ChunkConfig, questions: ResolvedQuestion[], queryVectors: number[][]) {
  const relevantRanks: (number | undefined)[] = [];
  const sourceRanks: (number | undefined)[] = [];
  for (const [i, q] of questions.entries()) {
    const results = await search(config, queryVectors[i]!, TOP_K);
    relevantRanks.push(firstRank(results, (c) => isRelevant(c, q)));
    sourceRanks.push(firstRank(results, (c) => c.source === q.source));
  }
  return { relevantRanks, sourceRanks };
}

await main();
