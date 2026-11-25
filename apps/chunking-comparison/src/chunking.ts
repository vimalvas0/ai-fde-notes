import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { findHeadings, headingPathAt } from "./documents.ts";
import type { Chunk, ChunkConfig, Doc } from "./types.ts";

/** Headings up to this level start a new chunk in the markdown strategy. */
const MAX_SPLIT_LEVEL = 3;

/** A section with less text than this under its heading is skipped (heading only). */
const MIN_BODY_CHARS = 20;

type Piece = { text: string; start: number };

/**
 * Split text into pieces of at most `size` characters. The splitter tries paragraph
 * breaks, then lines, then sentences, then words. `start` is where each piece begins
 * in `text`; the splitter does not report it, so we search forward for it.
 */
async function splitBySize(text: string, size: number, overlap: number): Promise<Piece[]> {
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: size, chunkOverlap: overlap });
  const pieces: Piece[] = [];
  let searchFrom = 0;
  for (const piece of await splitter.splitText(text)) {
    const start = text.indexOf(piece, searchFrom);
    pieces.push({ text: piece, start });
    searchFrom = start + 1; // the next piece may overlap this one
  }
  return pieces;
}

/** Strategy 1: fixed-size windows with overlap, blind to document structure. */
async function chunkRecursive(doc: Doc, config: ChunkConfig): Promise<Chunk[]> {
  const headings = findHeadings(doc.text);
  const pieces = await splitBySize(doc.text, config.size, config.overlap);
  return pieces.map((p, i) => ({
    text: p.text,
    source: doc.source,
    title: doc.title,
    section: headingPathAt(headings, p.start),
    chunkIndex: i,
    charStart: p.start,
    charEnd: p.start + p.text.length,
    strategy: config.name,
  }));
}

/** Strategy 2: cut at every heading, then split any long section by size with overlap. */
async function chunkMarkdown(doc: Doc, config: ChunkConfig): Promise<Chunk[]> {
  const headings = findHeadings(doc.text);
  const cutPoints = headings.filter((h) => h.level <= MAX_SPLIT_LEVEL && h.offset > 0).map((h) => h.offset);
  const bounds = [0, ...cutPoints, doc.text.length];

  const chunks: Chunk[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const sectionStart = bounds[i]!;
    const sectionText = doc.text.slice(sectionStart, bounds[i + 1]);
    const body = sectionText.split("\n").slice(1).join("\n");
    if (body.trim().length < MIN_BODY_CHARS) continue;

    for (const p of await splitBySize(sectionText, config.size, config.overlap)) {
      const charStart = sectionStart + p.start;
      chunks.push({
        text: p.text,
        source: doc.source,
        title: doc.title,
        section: headingPathAt(headings, sectionStart),
        chunkIndex: chunks.length,
        charStart,
        charEnd: charStart + p.text.length,
        strategy: config.name,
      });
    }
  }
  return chunks;
}

export async function chunkDocs(docs: Doc[], config: ChunkConfig): Promise<Chunk[]> {
  const chunkOne = config.strategy === "recursive" ? chunkRecursive : chunkMarkdown;
  const perDoc = await Promise.all(docs.map((doc) => chunkOne(doc, config)));
  return perDoc.flat();
}

/**
 * The text that gets embedded. The markdown strategy puts the heading path in front,
 * so the vector also carries where the passage sits in the document.
 */
export function textToEmbed(chunk: Chunk, config: ChunkConfig): string {
  if (config.strategy === "markdown") return `${chunk.title} > ${chunk.section}\n${chunk.text}`;
  return chunk.text;
}
