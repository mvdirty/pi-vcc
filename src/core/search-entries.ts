import type { Message } from "@mariozechner/pi-ai";
import type { RenderedEntry } from "./render-entries";
import { textOf } from "./content";

export interface SearchHit extends RenderedEntry {
  /** Context snippet around the first matched term (only when query provided) */
  snippet?: string;
}

/** Try to compile query as regex; fall back to escaped literal. */
const toRegex = (query: string): RegExp => {
  const terms = query.trim().split(/\s+/);
  // Single term: try as regex first
  if (terms.length === 1) {
    try {
      return new RegExp(terms[0], "i");
    } catch {
      return new RegExp(escapeRegex(terms[0]), "i");
    }
  }
  // Multiple terms: each must match (AND), but for snippet we use first term
  // Build a combined pattern for the first term only (search is done per-term)
  try {
    return new RegExp(terms[0], "i");
  } catch {
    return new RegExp(escapeRegex(terms[0]), "i");
  }
};

const escapeRegex = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Check if all query terms match the haystack. Supports regex per-term. */
const matchesAll = (hay: string, terms: string[]): boolean => {
  for (const t of terms) {
    try {
      if (!new RegExp(t, "i").test(hay)) return false;
    } catch {
      if (!new RegExp(escapeRegex(t), "i").test(hay)) return false;
    }
  }
  return true;
};

/** Line-based snippet: ±contextLines around first regex match. */
const lineSnippet = (text: string, regex: RegExp, contextLines = 2): string | undefined => {
  const lines = text.split("\n");
  let matchIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      matchIdx = i;
      break;
    }
  }
  if (matchIdx === -1) return undefined;

  const start = Math.max(0, matchIdx - contextLines);
  const end = Math.min(lines.length, matchIdx + contextLines + 1);
  const slice = lines.slice(start, end);

  const parts: string[] = [];
  if (start > 0) parts.push(`...(${start} lines above)`);
  parts.push(...slice);
  if (end < lines.length) parts.push(`...(${lines.length - end} lines below)`);
  return parts.join("\n");
};

/** Build full searchable text for a message. */
const fullText = (msg: Message): string => {
  if ((msg as any).role === "bashExecution") {
    return `${(msg as any).command ?? ""} ${(msg as any).output ?? ""}`;
  }
  return textOf(msg.content);
};

export const searchEntries = (
  entries: RenderedEntry[],
  messages: Message[],
  query?: string,
): SearchHit[] => {
  if (!query?.trim()) return entries;
  const terms = query.trim().split(/\s+/);
  const firstRegex = toRegex(query);

  const hits: SearchHit[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const msg = messages[i];
    const text = msg ? fullText(msg) : e.summary;
    const filePart = e.files?.join(" ") ?? "";
    const hay = `${e.role} ${text} ${filePart}`;

    if (matchesAll(hay, terms)) {
      const snip = lineSnippet(text, firstRegex);
      hits.push({ ...e, snippet: snip });
    }
  }
  return hits;
};
