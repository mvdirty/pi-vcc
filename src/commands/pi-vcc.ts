import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { formatCompactionStats, getLastCompactionStats, PI_VCC_COMPACT_INSTRUCTION } from "../hooks/before-compact";

const KEEP_TOKEN_RE = /^keep:(\d+)$/;

const parseKeepUserTurns = (raw: string): number => {
  const value = Number(raw);
  return Number.isSafeInteger(value) ? value : Number.MAX_SAFE_INTEGER;
};

const parsePiVccArgs = (args: string): { followUpPrompt: string; keepUserTurns: number | null } => {
  const trimmed = args.trim();
  if (!trimmed) return { followUpPrompt: "", keepUserTurns: null };

  const startMatch = trimmed.match(/^keep:(\d+)(?:\s+|$)([\s\S]*)$/);
  if (startMatch) {
    return {
      followUpPrompt: startMatch[2].trim(),
      keepUserTurns: parseKeepUserTurns(startMatch[1]),
    };
  }

  const parts = trimmed.split(/\s+/);
  const endMatch = parts[parts.length - 1].match(KEEP_TOKEN_RE);
  if (endMatch) {
    return {
      followUpPrompt: trimmed.slice(0, trimmed.length - parts[parts.length - 1].length).trim(),
      keepUserTurns: parseKeepUserTurns(endMatch[1]),
    };
  }

  return { followUpPrompt: trimmed, keepUserTurns: null };
};

const buildCustomInstructions = (keepUserTurns: number | null): string => {
  if (keepUserTurns == null) return PI_VCC_COMPACT_INSTRUCTION;
  return `${PI_VCC_COMPACT_INSTRUCTION} keep:${keepUserTurns}`;
};

export const registerPiVccCommand = (pi: ExtensionAPI) => {
  pi.registerCommand("pi-vcc", {
    description: "Compact conversation with pi-vcc structured summary",
    handler: async (args: string, ctx) => {
      const { followUpPrompt, keepUserTurns } = parsePiVccArgs(args);
      ctx.compact({
        customInstructions: buildCustomInstructions(keepUserTurns),
        onComplete: () => {
          const stats = getLastCompactionStats();
          if (stats) {
            ctx.ui.notify(formatCompactionStats(stats), "info");
          } else {
            ctx.ui.notify("Compacted with pi-vcc", "info");
          }
          if (followUpPrompt) {
            try {
              void Promise.resolve(pi.sendUserMessage(followUpPrompt)).catch(() => {});
            } catch {}
          }
        },
        onError: (err) => {
          if (err.message === "Compaction cancelled" || err.message === "Already compacted") {
            ctx.ui.notify("Nothing to compact", "warning");
          } else {
            ctx.ui.notify(`Compaction failed: ${err.message}`, "error");
          }
        },
      });
    },
  });
};
