import type { FileOps, NormalizedBlock } from "../types";
import { clip, firstLine, nonEmptyLines } from "./content";
import { redact } from "./redact";
import type { SectionData } from "../sections";
import { extractGoals } from "../extract/goals";
import { extractFiles } from "../extract/files";
import { extractFindings } from "../extract/findings";
import { extractPreferences } from "../extract/preferences";
import { extractPath } from "./tool-args";

export interface BuildSectionsInput {
  blocks: NormalizedBlock[];
  fileOps?: FileOps;
}

const TOOL_SUMMARY_FIELDS: Record<string, string> = {
  Read: "file_path", Edit: "file_path", Write: "file_path",
  read: "file_path", edit: "file_path", write: "file_path",
  Glob: "pattern", Grep: "pattern",
};

const toolOneLiner = (name: string, args: Record<string, unknown>): string => {
  const field = TOOL_SUMMARY_FIELDS[name];
  if (field && typeof args[field] === "string") {
    return `* ${name} "${clip(args[field] as string, 60)}"`;
  }
  const path = extractPath(args);
  if (path) return `* ${name} "${clip(path, 60)}"`;
  if (name === "bash" || name === "Bash") {
    const cmd = (args.command ?? args.description ?? "") as string;
    return `* ${name} "${redact(clip(cmd, 80))}"`;
  }
  if (typeof args.query === "string") {
    return `* ${name} "${clip(args.query as string, 60)}"`;
  }
  return `* ${name}`;
};

const extractActionsTaken = (blocks: NormalizedBlock[]): string[] => {
  const raw: string[] = [];
  for (const b of blocks) {
    if (b.kind === "tool_call") raw.push(toolOneLiner(b.name, b.args));
  }
  const counts = new Map<string, number>();
  for (const d of raw) counts.set(d, (counts.get(d) ?? 0) + 1);
  return [...counts.entries()]
    .map(([k, v]) => (v > 1 ? `${k} x${v}` : k))
    .slice(0, 20);
};

const FILLER_RE = /^(ok|sure|done|got it|alright|let me|i('ll| will)|here'?s|understood)/i;
const BLOCKER_RE =
  /\b(fail(ed|s|ure|ing)?|broken|cannot|can't|won't work|does not work|doesn't work|still (broken|failing|wrong)|blocked|blocker|not (fixed|resolved|working)|crash(es|ed|ing)?)\b/i;

const TRUNCATE_TOKENS = 128;

const truncateText = (text: string, limit = TRUNCATE_TOKENS): string => {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= limit) return text;
  return words.slice(0, limit).join(" ") + "...(truncated)";
};

const extractKeyConversationTurns = (blocks: NormalizedBlock[]): string[] => {
  const turns: string[] = [];
  const conversational = blocks.filter(
    (b) => b.kind === "user" || b.kind === "assistant",
  );
  const recent = conversational.slice(-12);

  for (const b of recent) {
    const text = b.text.trim();
    if (!text || text.length < 10) continue;
    if (b.kind === "user" && FILLER_RE.test(text)) continue;
    const prefix = b.kind === "user" ? "[user] " : "[assistant] ";
    turns.push(prefix + truncateText(text, TRUNCATE_TOKENS));
  }

  return turns.slice(-8);
};

const extractOutstandingContext = (blocks: NormalizedBlock[]): string[] => {
  const items: string[] = [];
  const tail = blocks.slice(-20);

  for (const b of tail) {
    if (b.kind === "tool_result" && b.isError) {
      items.push(`[${b.name}] ${firstLine(b.text, 150)}`);
      continue;
    }

    if (b.kind === "assistant" || b.kind === "user") {
      for (const line of nonEmptyLines(b.text)) {
        if (!BLOCKER_RE.test(line)) continue;
        if (line.length < 15) continue;
        const clipped = b.kind === "user" ? `[user] ${clip(line, 150)}` : clip(line, 150);
        if (!items.includes(clipped)) items.push(clipped);
        break;
      }
    }
  }

  return items.slice(0, 5);
};

export const buildSections = (input: BuildSectionsInput): SectionData => {
  const { blocks, fileOps } = input;
  const fa = extractFiles(blocks, fileOps);
  return {
    sessionGoal: extractGoals(blocks),
    keyConversationTurns: extractKeyConversationTurns(blocks),
    actionsTaken: extractActionsTaken(blocks),
    importantEvidence: extractFindings(blocks),
    filesRead: [...fa.read],
    filesModified: [...fa.modified],
    filesCreated: [...fa.created],
    outstandingContext: extractOutstandingContext(blocks),
    userPreferences: extractPreferences(blocks),
  };
};
