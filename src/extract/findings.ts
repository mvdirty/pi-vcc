import type { NormalizedBlock } from "../types";
import { clip } from "../core/content";

const TRUNCATE_TOKENS = 128;
const NOISE_TOOLS = new Set(["TodoWrite", "ToolSearch", "Skill"]);

const truncateText = (text: string, limit = TRUNCATE_TOKENS): string => {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= limit) return text;
  return words.slice(0, limit).join(" ") + "...(truncated)";
};

export const extractFindings = (blocks: NormalizedBlock[]): string[] => {
  const results: string[] = [];

  for (const b of blocks) {
    if (b.kind !== "tool_result") continue;
    if (b.isError) continue;
    if (NOISE_TOOLS.has(b.name)) continue;
    const text = b.text.trim();
    if (!text || text.length < 20) continue;
    results.push(`[${b.name}] ${truncateText(text, TRUNCATE_TOKENS)}`);
  }

  return results.slice(-15);
};

