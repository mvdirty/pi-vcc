import type { NormalizedBlock } from "../types";
import { clip, firstLine } from "./content";
import { redact } from "./redact";
import { extractPath } from "./tool-args";

const TRUNCATE_USER = 256;
const TRUNCATE_ASSISTANT = 128;

// ── noise filtering ──

const isNoiseUser = (text: string): boolean => {
  return !text.trim();
};

// ── truncation ──

const TOK_RE = /[a-zA-Z]+|[0-9]+|[^\sa-zA-Z0-9]|\s+/g;

const truncateTokens = (text: string, limit: number): string => {
  const flat = text.replace(/\s+/g, " ").trim();
  const matches = flat.match(TOK_RE);
  if (!matches) return flat;
  let count = 0;
  let cut = matches.length;
  for (let i = 0; i < matches.length; i++) {
    if (matches[i].trim()) {
      count++;
      if (count > limit) { cut = i; break; }
    }
  }
  if (cut >= matches.length) return flat;
  return matches.slice(0, cut).join("") + "...(truncated)";
};

// ── tool summary ──

const TOOL_SUMMARY_FIELDS: Record<string, string> = {
  Read: "file_path", Edit: "file_path", Write: "file_path",
  read: "file_path", edit: "file_path", write: "file_path",
  Glob: "pattern", Grep: "pattern",
};

const toolOneLiner = (name: string, args: Record<string, unknown>): string => {
  const field = TOOL_SUMMARY_FIELDS[name];
  if (field && typeof args[field] === "string") {
    return `* ${name} "${args[field] as string}"`;
  }
  const path = extractPath(args);
  if (path) return `* ${name} "${path}"`;
  if (name === "bash" || name === "Bash") {
    const cmd = (args.command ?? args.description ?? "") as string;
    if (cmd.length > 60) {
      return `* ${name} "${redact(cmd.slice(0, 57))}..."`;
    }
    return `* ${name} "${redact(cmd)}"`;
  }
  if (typeof args.query === "string") {
    return `* ${name} "${clip(args.query as string, 60)}"`;
  }
  return `* ${name}`;
};

export interface BriefLine {
  /** Section header like "[user]", "[assistant]", "[tool_error] bash" */
  header: string;
  /** Content lines for this section */
  lines: string[];
}

/**
 * Compile NormalizedBlocks into a chronological brief transcript.
 *
 * Rules (adapted from VCC lower_brief):
 * 1. User text — truncate to TRUNCATE_USER tokens
 * 2. Assistant text — truncate to TRUNCATE_ASSISTANT tokens
 * 3. Tool calls — collapse to one-liner summary
 * 4. Tool results — hide, except errors (show first line)
 * 5. Thinking — hide entirely
 * 6. Adjacent assistant sections — merge
 */
export const compileBrief = (blocks: NormalizedBlock[]): string => {
  const sections: BriefLine[] = [];
  let lastHeader = "";

  const push = (header: string, line: string) => {
    // Merge adjacent assistant sections
    if (header === lastHeader && sections.length > 0) {
      sections[sections.length - 1].lines.push(line);
      return;
    }
    sections.push({ header, lines: [line] });
    lastHeader = header;
  };

  for (const b of blocks) {
    switch (b.kind) {
      case "user": {
        if (isNoiseUser(b.text)) break;
        const text = truncateTokens(b.text, TRUNCATE_USER);
        if (text) {
          const ref = b.sourceIndex != null ? ` (#${b.sourceIndex})` : "";
          push("[user]", text + ref);
        }
        lastHeader = "[user]";
        break;
      }
      case "assistant": {
        const text = truncateTokens(b.text, TRUNCATE_ASSISTANT);
        if (text) {
          const ref = b.sourceIndex != null ? ` (#${b.sourceIndex})` : "";
          push("[assistant]", text + ref);
        }
        break;
      }
      case "tool_call": {
        const ref = b.sourceIndex != null ? ` (#${b.sourceIndex})` : "";
        const summary = toolOneLiner(b.name, b.args) + ref;
        push("[assistant]", summary);
        break;
      }
      case "tool_result": {
        if (b.isError) {
          const ref = b.sourceIndex != null ? ` (#${b.sourceIndex})` : "";
          const header = `[tool_error] ${b.name}${ref}`;
          push(header, firstLine(b.text, 150));
          lastHeader = header;
        }
        // Non-error tool results are hidden (too verbose)
        break;
      }
      case "thinking":
        // Hidden entirely
        break;
    }
  }

  // Emit sections — suppress blank lines between consecutive tool summaries
  const out: string[] = [];
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    if (i > 0) {
      const prev = sections[i - 1];
      const prevIsTools = prev.header === "[assistant]" &&
        prev.lines.every((l) => l.startsWith("* "));
      const curIsTools = sec.header === "[assistant]" &&
        sec.lines.every((l) => l.startsWith("* "));
      // Suppress blank line between consecutive tool-only assistant sections
      if (!(prevIsTools && curIsTools)) {
        out.push("");
      }
    }
    out.push(sec.header);
    for (const line of sec.lines) {
      out.push(line);
    }
  }

  return out.join("\n");
};
