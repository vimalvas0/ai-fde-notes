/** A source file, loaded whole. `source` is its path from the repo root. */
export type Doc = {
  source: string;
  title: string;
  text: string;
};

/** A piece of a Doc. The offsets point at the exact place in the source text. */
export type Chunk = {
  text: string;
  source: string;
  title: string;
  /** Heading path, for example "How it works > The error types". */
  section: string;
  chunkIndex: number;
  charStart: number;
  charEnd: number;
  /** Name of the config that made it, for example "recursive-800". */
  strategy: string;
};

export type StrategyName = "recursive" | "markdown";

/** One chunking setup. Size and overlap are in characters. */
export type ChunkConfig = {
  name: string;
  strategy: StrategyName;
  size: number;
  overlap: number;
};

/** A test question and where its answer lives. */
export type Question = {
  q: string;
  /** File that holds the answer. */
  source: string;
  /** Text of the heading that holds the answer (case-insensitive contains). */
  section: string;
};

/** A Question with the character range of its expected section resolved. */
export type ResolvedQuestion = Question & { span: Span };

export type Span = { start: number; end: number };

/** Scores for one config. */
export type Summary = {
  name: string;
  chunks: number;
  avgChars: number;
  hit1: number;
  hit3: number;
  hit5: number;
  mrr: number;
  sourceHit1: number;
};
