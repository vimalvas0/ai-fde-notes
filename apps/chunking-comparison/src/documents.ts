import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Doc, Span } from "./types.ts";

export const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

/** The corpus is every note and every app README, except this project's own files. */
export function loadDocs(): Doc[] {
  const files = [...listMarkdown("notes"), ...appReadmes()].filter((f) => !f.includes("chunking"));
  return files.map((source) => {
    const text = readFileSync(path.join(REPO_ROOT, source), "utf-8");
    return { source, title: firstHeading(text) ?? source, text };
  });
}

function listMarkdown(dir: string): string[] {
  const entries = readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true });
  return entries.flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return listMarkdown(rel);
    return e.name.endsWith(".md") ? [rel] : [];
  });
}

function appReadmes(): string[] {
  return readdirSync(path.join(REPO_ROOT, "apps"), { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "node_modules")
    .map((e) => `apps/${e.name}/README.md`)
    .filter((f) => readdirSync(path.join(REPO_ROOT, path.dirname(f))).includes("README.md"));
}

// ---- headings ----

export type Heading = { level: number; title: string; offset: number };

const HEADING = /^(#{1,6})\s+(.*\S)\s*$/;

function firstHeading(text: string): string | undefined {
  return findHeadings(text)[0]?.title;
}

/** Every heading with its character offset. Lines inside code fences are ignored. */
export function findHeadings(text: string): Heading[] {
  const headings: Heading[] = [];
  let offset = 0;
  let inFence = false;
  for (const line of text.split(/(?<=\n)/)) {
    if (line.trimStart().startsWith("```")) {
      inFence = !inFence;
    } else if (!inFence) {
      const match = HEADING.exec(line.trimEnd());
      if (match) headings.push({ level: match[1]!.length, title: match[2]!, offset });
    }
    offset += line.length;
  }
  return headings;
}

/** The heading path active at a character offset, without the document title. */
export function headingPathAt(headings: Heading[], offset: number): string {
  const stack: Heading[] = [];
  for (const h of headings) {
    if (h.offset > offset) break;
    while (stack.length && stack.at(-1)!.level >= h.level) stack.pop();
    stack.push(h);
  }
  const withoutTitle = stack.length > 1 ? stack.slice(1) : stack;
  return withoutTitle.map((h) => h.title).join(" > ");
}

/** Character range of the first heading that contains `needle`, through its subsections. */
export function findSection(text: string, needle: string): Span | undefined {
  const headings = findHeadings(text);
  const i = headings.findIndex((h) => h.title.toLowerCase().includes(needle.toLowerCase()));
  if (i === -1) return undefined;
  const heading = headings[i]!;
  const next = headings.slice(i + 1).find((h) => h.level <= heading.level);
  return { start: heading.offset, end: next?.offset ?? text.length };
}
