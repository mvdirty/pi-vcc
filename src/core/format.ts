import type { SectionData } from "../sections";
import type { CompactEntry } from "./brief";

const section = (title: string, items: string[]): string => {
  if (items.length === 0) return "";
  const body = items.map((i) => `- ${i}`).join("\n");
  return `[${title}]\n${body}`;
};

const BRIEF_MAX_LINES = 120;

export const capBrief = (text: string): string => {
  const lines = text.split("\n");
  if (lines.length <= BRIEF_MAX_LINES) return text;
  const omitted = lines.length - BRIEF_MAX_LINES;
  const kept = lines.slice(-BRIEF_MAX_LINES);
  // Find first section header to avoid cutting mid-section
  const firstHeader = kept.findIndex((l) => /^\[.+\]/.test(l));
  const clean = firstHeader > 0 ? kept.slice(firstHeader) : kept;
  return `...(${omitted} earlier lines omitted)\n\n${clean.join("\n")}`;
};

export const RECALL_NOTE =
  "Use `vcc_recall` to search for prior work, decisions, and context from before this summary. " +
  "Do not redo work already completed.";

export const formatSummary = (
data: SectionData): string => {
  const headerParts = [
    section("Session Goal", data.sessionGoal),
    section("Files And Changes", data.filesAndChanges),
    section("Outstanding Context", data.outstandingContext),
    section("User Preferences", data.userPreferences),
  ].filter(Boolean);

  const parts: string[] = [];
  if (headerParts.length > 0) {
    parts.push(headerParts.join("\n\n"));
  }
  if (data.briefTranscript) {
    parts.push(capBrief(data.briefTranscript));
  }

  if (parts.length === 0) return "";

  // Hint: remind AI that older conversation is searchable via vcc_recall
  parts.push(RECALL_NOTE);

  return parts.join("\n\n---\n\n");
};

export interface JsonSummary {
  sessionGoal: string[];
  filesAndChanges: string[];
  outstandingContext: string[];
  userPreferences: string[];
  transcript: CompactEntry[];
  note: string;
}

const BRIEF_MAX_ENTRIES = 120;

const capTranscript = (entries: CompactEntry[]): CompactEntry[] => {
  if (entries.length <= BRIEF_MAX_ENTRIES) return entries;
  const omitted = entries.length - BRIEF_MAX_ENTRIES;
  const kept = entries.slice(-BRIEF_MAX_ENTRIES);
  return [["a", `...(${omitted} earlier entries omitted)`], ...kept];
};

export const formatJsonSummary = (data: SectionData): string => {
  const obj: JsonSummary = {
    sessionGoal: data.sessionGoal,
    filesAndChanges: data.filesAndChanges,
    outstandingContext: data.outstandingContext,
    userPreferences: data.userPreferences,
    transcript: capTranscript(data.compactEntries),
    note: RECALL_NOTE,
  };
  return JSON.stringify(obj);
};
