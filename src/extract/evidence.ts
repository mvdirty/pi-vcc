import type { NormalizedBlock } from "../types";
import { extractPath } from "../core/tool-args";

export interface EvidenceActivity {
  paths: Set<string>;
  identifiers: Set<string>;
  errorSignatures: Set<string>;
}

const ABS_PATH_RE = /(?:^|[\s"'`(=])(\/(?:tmp|var|home|workspace|app|repo|src|tests?)\/[\w./-]+)/g;
const PROJECT_PATH_RE = /(?:^|[\s"'`(=])((?:src|test|tests|scripts|bench)\/[\w./-]+)/g;
const ERROR_SIGNATURE_RE = /\b(?:ERR_[A-Z0-9_]+|(?:CACHE|CRITICAL|FATAL|PANIC|ERROR|FAIL)[A-Z0-9_]*(?:_[A-Z0-9]+)+)\b/g;
const ID_RE = /\b(?:cache|probe|span|spn|req|request|trace|artifact|bench)[A-Za-z0-9_-]*_[A-Za-z0-9_-]+\b/g;
const COMMIT_RE = /\bcommit(?:\s+|[=:])([0-9a-f]{7,40})\b/gi;

const addMatches = (set: Set<string>, text: string, regex: RegExp, group = 0) => {
  for (const match of text.matchAll(regex)) {
    const value = (match[group] ?? match[0]).trim();
    if (value) set.add(value);
  }
};

const textFromBlock = (block: NormalizedBlock): string => {
  if (block.kind === "tool_call") return JSON.stringify(block.args ?? {});
  return "text" in block ? block.text : "";
};

const addEvidenceFromText = (activity: EvidenceActivity, text: string) => {
  addMatches(activity.paths, text, ABS_PATH_RE, 1);
  addMatches(activity.paths, text, PROJECT_PATH_RE, 1);
  addMatches(activity.errorSignatures, text, ERROR_SIGNATURE_RE);
  addMatches(activity.identifiers, text, ID_RE);
  addMatches(activity.identifiers, text, COMMIT_RE, 1);
};

export const extractEvidence = (blocks: NormalizedBlock[]): EvidenceActivity => {
  const activity: EvidenceActivity = {
    paths: new Set(),
    identifiers: new Set(),
    errorSignatures: new Set(),
  };

  for (const block of blocks) {
    if (block.kind === "tool_call") {
      const path = extractPath(block.args);
      if (path) activity.paths.add(path);
      for (const key of ["command", "cmd", "query", "path", "file", "file_path", "filePath"]) {
        const value = block.args[key];
        if (typeof value === "string") addEvidenceFromText(activity, value);
      }
      continue;
    }

    addEvidenceFromText(activity, textFromBlock(block));
  }

  return activity;
};

const cap = (set: Set<string>, limit: number): string => {
  const values = [...set];
  if (values.length <= limit) return values.join(", ");
  return `${values.slice(0, limit).join(", ")} (+more)`;
};

export const formatEvidence = (activity: EvidenceActivity): string[] => {
  const lines: string[] = [];
  if (activity.paths.size > 0) lines.push(`Paths: ${cap(activity.paths, 12)}`);
  if (activity.errorSignatures.size > 0) lines.push(`Error signatures: ${cap(activity.errorSignatures, 12)}`);
  if (activity.identifiers.size > 0) lines.push(`Identifiers: ${cap(activity.identifiers, 16)}`);
  return lines;
};
