import { EmbeddingModel } from "fastembed";
import type { ChunkConfig } from "./types.ts";

/** Local embedding model: 384-dimension vectors, runs through ONNX, no API key. */
export const EMBEDDING_MODEL = EmbeddingModel.BGESmallENV15;
export const VECTOR_SIZE = 384;

export const QDRANT_URL = process.env.QDRANT_URL ?? "http://localhost:6333";

/** How many results to fetch per question. */
export const TOP_K = 5;

/** One entry = one chunking setup = one Qdrant collection. */
export const CONFIGS: ChunkConfig[] = [
  { name: "recursive-400", strategy: "recursive", size: 400, overlap: 60 },
  { name: "recursive-800", strategy: "recursive", size: 800, overlap: 120 },
  { name: "recursive-1200", strategy: "recursive", size: 1200, overlap: 180 },
  { name: "markdown-800", strategy: "markdown", size: 800, overlap: 120 },
];
