import type { Message } from "@mariozechner/pi-ai";
import type { FileOps } from "../types";
import { normalize } from "./normalize";
import { filterNoise } from "./filter-noise";
import { buildSections } from "./build-sections";
import { formatSummary, formatJsonSummary, capBrief } from "./format";
import type { JsonSummary } from "./format";
import type { CompactEntry } from "./brief";
import { redact } from "./redact";

export interface CompileInput {
  messages: Message[];
  previousSummary?: string;
  fileOps?: FileOps;
  format?: "text" | "json";
}

const HEADER_NAMES = ["Session Goal", "Files And Changes", "Outstanding Context", "User Preferences"];

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
  // Outstanding Context is volatile -- always use fresh only
  if (header === "Outstanding Context") return fresh;
  if (!prev) return fresh;
  if (!fresh) return prev;

  // Files And Changes: merge by category (Modified/Created/Read), dedup paths
  if (header === "Files And Changes") {
    return mergeFileLines(prev, fresh);
  }

  // Session Goal, User Preferences: line-level dedup, cap
  const isClean = (l: string) => l.startsWith("- ") && !l.includes("<skill") && !l.includes("</skill");
  const prevLines = prev.split("\n").filter(isClean);
  const freshLines = fresh.split("\n").filter(isClean);
  const combined = [...new Set([...prevLines, ...freshLines])];
  const CAP = header === "Session Goal" ? 8 : 15;
  const capped = combined.length > CAP ? combined.slice(-CAP) : combined;
  if (capped.length === 0) return "";
  return `[${header}]\n${capped.join("\n")}`;
};

/** Merge Files And Changes by category, dedup paths across compactions */
const mergeFileLines = (prev: string, fresh: string): string => {
  const categories = ["Modified", "Created", "Read"] as const;
  const merged: Record<string, Set<string>> = {};
  for (const cat of categories) merged[cat] = new Set();

  // Parse "- Modified: a, b, c (+N more)" lines from both prev and fresh
  for (const text of [prev, fresh]) {
    for (const line of text.split("\n")) {
      for (const cat of categories) {
        const prefix = `- ${cat}: `;
        if (!line.startsWith(prefix)) continue;
        let rest = line.slice(prefix.length);
        // Strip "(+N more)" suffix
        rest = rest.replace(/\s*\(\+\d+ more\)\s*$/, "");
        for (const p of rest.split(",")) {
          const trimmed = p.trim();
          if (trimmed) merged[cat].add(trimmed);
        }
      }
    }
  }

  // Dedup: if already in Modified, drop from Created (file existed before)
  for (const p of merged.Modified) merged.Created.delete(p);

  const cap = (set: Set<string>, limit: number) => {
    const arr = [...set];
    if (arr.length <= limit) return arr.join(", ");
    return arr.slice(0, limit).join(", ") + ` (+${arr.length - limit} more)`;
  };

  const lines: string[] = [];
  if (merged.Modified.size > 0) lines.push(`- Modified: ${cap(merged.Modified, 10)}`);
  if (merged.Created.size > 0) lines.push(`- Created: ${cap(merged.Created, 10)}`);
  if (merged.Read.size > 0) lines.push(`- Read: ${cap(merged.Read, 10)}`);
  if (lines.length === 0) return "";
  return `[Files And Changes]\n${lines.join("\n")}`;
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

const BRIEF_MAX_ENTRIES = 120;

/** Merge JSON previous summary with fresh SectionData */
const mergeJsonPrevious = (prevJson: JsonSummary, data: SectionData): string => {
  // Files And Changes: merge by category, dedup
  const mergedFiles = mergeFileLinesFromArrays(prevJson.filesAndChanges, data.filesAndChanges);

  // Session Goal, User Preferences: dedup, cap
  const mergeLines = (prev: string[], fresh: string[], cap: number): string[] => {
    const isClean = (l: string) => !l.includes("<skill") && !l.includes("</skill");
    const combined = [...new Set([...prev.filter(isClean), ...fresh.filter(isClean)])];
    return combined.length > cap ? combined.slice(-cap) : combined;
  };

  // Transcript: append fresh compact entries, cap
  const mergedTranscript: CompactEntry[] = [...prevJson.transcript, ...data.compactEntries];
  const cappedTranscript = mergedTranscript.length > BRIEF_MAX_ENTRIES
    ? [
        ["a", `...(${mergedTranscript.length - BRIEF_MAX_ENTRIES} earlier entries omitted)`] as CompactEntry,
        ...mergedTranscript.slice(-BRIEF_MAX_ENTRIES),
      ]
    : mergedTranscript;

  const obj: JsonSummary = {
    sessionGoal: mergeLines(prevJson.sessionGoal, data.sessionGoal, 8),
    filesAndChanges: mergedFiles,
    outstandingContext: data.outstandingContext, // volatile, always fresh
    userPreferences: mergeLines(prevJson.userPreferences, data.userPreferences, 15),
    transcript: cappedTranscript,
    note: "Conversation history before this summary is searchable via `vcc_recall`.",
  };
  return JSON.stringify(obj);
};

/** Merge file lines from two string arrays (JSON mode) */
const mergeFileLinesFromArrays = (prev: string[], fresh: string[]): string[] => {
  const categories = ["Modified", "Created", "Read"] as const;
  const merged: Record<string, Set<string>> = {};
  for (const cat of categories) merged[cat] = new Set();

  for (const arr of [prev, fresh]) {
    for (const line of arr) {
      for (const cat of categories) {
        if (!line.startsWith(`${cat}: `)) continue;
        let rest = line.slice(cat.length + 2);
        rest = rest.replace(/\s*\(\+\d+ more\)\s*$/, "");
        for (const p of rest.split(",")) {
          const trimmed = p.trim();
          if (trimmed) merged[cat].add(trimmed);
        }
      }
    }
  }

  for (const p of merged.Modified) merged.Created.delete(p);

  const cap = (set: Set<string>, limit: number) => {
    const arr = [...set];
    if (arr.length <= limit) return arr.join(", ");
    return arr.slice(0, limit).join(", ") + ` (+${arr.length - limit} more)`;
  };

  const lines: string[] = [];
  if (merged.Modified.size > 0) lines.push(`Modified: ${cap(merged.Modified, 10)}`);
  if (merged.Created.size > 0) lines.push(`Created: ${cap(merged.Created, 10)}`);
  if (merged.Read.size > 0) lines.push(`Read: ${cap(merged.Read, 10)}`);
  return lines;
};

/** Try parsing previous summary as JSON */
const tryParseJsonSummary = (text: string): JsonSummary | null => {
  try {
    const obj = JSON.parse(text);
    if (obj && Array.isArray(obj.transcript)) return obj as JsonSummary;
    return null;
  } catch {
    return null;
  }
};

export const compile = (input: CompileInput): string => {
  const fmt = input.format ?? "text";
  const blocks = filterNoise(normalize(input.messages));
  const data = buildSections({ blocks });

  if (fmt === "json") {
    if (input.previousSummary) {
      const prevJson = tryParseJsonSummary(input.previousSummary);
      if (prevJson) {
        return redact(mergeJsonPrevious(prevJson, data));
      }
      // Previous was text format -- merge as text, then convert fresh to JSON
      // (transition from text to json mode mid-session)
      const textMerged = input.previousSummary ? mergePrevious(input.previousSummary, formatSummary(data)) : formatSummary(data);
      // Can't cleanly convert merged text to JSON, so just output fresh JSON
      // with a note about previous context
      return redact(formatJsonSummary(data));
    }
    return redact(formatJsonSummary(data));
  }

  // Text mode (default)
  const fresh = formatSummary(data);
  const merged = input.previousSummary ? mergePrevious(input.previousSummary, fresh) : fresh;
  return redact(merged);
};
