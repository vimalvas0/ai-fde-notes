import { QdrantClient } from "@qdrant/js-client-rest";
import { QDRANT_URL, VECTOR_SIZE } from "./config.ts";
import type { Chunk, ChunkConfig } from "./types.ts";

// created on first use, so `npm run chunks` never touches Qdrant
let client: QdrantClient | undefined;
const qdrant = () => (client ??= new QdrantClient({ url: QDRANT_URL }));
const UPLOAD_BATCH = 100;

/** Collection name for a config, for example "chunks_recursive_800". */
const collectionFor = (config: ChunkConfig) => `chunks_${config.name.replaceAll("-", "_")}`;

/** Drop and recreate the config's collection, then store every chunk with its vector. */
export async function storeChunks(config: ChunkConfig, chunks: Chunk[], vectors: number[][]): Promise<void> {
  const name = collectionFor(config);
  if ((await qdrant().collectionExists(name)).exists) await qdrant().deleteCollection(name);
  await qdrant().createCollection(name, { vectors: { size: VECTOR_SIZE, distance: "Cosine" } });

  const points = chunks.map((chunk, i) => ({
    id: i,
    vector: vectors[i]!,
    // the payload is the metadata: source, section and offsets travel with every vector
    payload: { ...chunk, size: config.size, overlap: config.overlap },
  }));
  for (let i = 0; i < points.length; i += UPLOAD_BATCH) {
    await qdrant().upsert(name, { wait: true, points: points.slice(i, i + UPLOAD_BATCH) });
  }
}

/** The closest chunks to a query vector, best first. */
export async function search(config: ChunkConfig, queryVector: number[], limit: number): Promise<Chunk[]> {
  const { points } = await qdrant().query(collectionFor(config), { query: queryVector, limit, with_payload: true });
  return points.map((p) => p.payload as unknown as Chunk);
}
