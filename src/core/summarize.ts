import type { Message } from "@mariozechner/pi-ai";
import type { FileOps } from "../types";
import { normalize } from "./normalize";
import { filterNoise } from "./filter-noise";
import { buildSections } from "./build-sections";
import { formatSummary, capBrief } from "./format";
import { redact } from "./redact";

export interface CompileInput {
  messages: Message[];
  previousSummary?: string;
  fileOps?: FileOps;
}

const HEADER_NAMES = ["Session Goal", "Files And Changes", "Outstanding Context"];

const SEPARATOR = "\n\n---\n\n";

/** Extract a named section from summary text */
const sectionOf = (text: string, header: string): string => {
  const tag = `[${header}]`;
  const start = text.indexOf(tag);
  if (start < 0) return "";
  const after = text.slice(start);
  // Find next section header or separator
  const nextSection = HEADER_NAMES
    .filter((h) => h !== header)
    .map((h) => after.indexOf(`[${h}]`))
    .filter((n) => n > 0);
  const nextSep = after.indexOf("\n\n---\n\n");
  const candidates = [...nextSection, ...(nextSep > 0 ? [nextSep] : [])].sort((a, b) => a - b);
  const end = candidates[0];
  return (end ? after.slice(0, end) : after).trim();
};

/** Extract the brief transcript part (everything after ---) */
const briefOf = (text: string): string => {
  const idx = text.indexOf(SEPARATOR);
  if (idx < 0) return "";
  return text.slice(idx + SEPARATOR.length).trim();
};

/** Merge a header section */
const mergeHeaderSection = (header: string, prev: string, fresh: string): string => {
  // Outstanding Context is volatile — always use fresh only
  if (header === "Outstanding Context") return fresh;
  // Session Goal & Files And Changes: append new items, dedupe
  if (!prev) return fresh;
  if (!fresh) return prev;
  const prevLines = prev.split("\n").filter((l) => l.startsWith("- "));
  const freshLines = fresh.split("\n").filter((l) => l.startsWith("- "));
  const combined = [...new Set([...prevLines, ...freshLines])];
  if (combined.length === 0) return "";
  return `[${header}]\n${combined.join("\n")}`;
};

const mergeBriefTranscript = (prev: string, fresh: string): string => {
  if (!prev) return fresh;
  if (!fresh) return prev;
  return prev + "\n\n" + fresh;
};

const mergePrevious = (prev: string, fresh: string): string => {
  // Merge header sections
  const headers = HEADER_NAMES
    .map((header) => {
      const freshSec = sectionOf(fresh, header);
      const prevSec = sectionOf(prev, header);
      return mergeHeaderSection(header, prevSec, freshSec);
    })
    .filter(Boolean);

  // Merge brief transcript
  const prevBrief = briefOf(prev);
  const freshBrief = briefOf(fresh);
  const mergedBrief = mergeBriefTranscript(prevBrief, freshBrief);

  const parts: string[] = [];
  if (headers.length > 0) {
    parts.push(headers.join("\n\n"));
  }
  if (mergedBrief) {
    parts.push(capBrief(mergedBrief));
  }

  return parts.join(SEPARATOR);
};

export const compile = (input: CompileInput): string => {
  const blocks = filterNoise(normalize(input.messages));
  const data = buildSections({ blocks });
  const fresh = formatSummary(data);
  const merged = input.previousSummary ? mergePrevious(input.previousSummary, fresh) : fresh;
  return redact(merged);
};
