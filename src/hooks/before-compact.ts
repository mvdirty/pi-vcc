import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { convertToLlm } from "@mariozechner/pi-coding-agent";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { compile } from "../core/summarize";
import type { PiVccCompactionDetails } from "../details";

const CONFIG_PATH = join(homedir(), ".pi", "agent", "pi-vcc-config.json");

export interface PiVccConfig {
  debug?: boolean;
}

const loadConfig = (): PiVccConfig => {
  try { return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")); } catch { return {}; }
};

const dbg = (config: PiVccConfig, data: Record<string, unknown>) => {
  if (!config.debug) return;
  try { writeFileSync("/tmp/pi-vcc-debug.json", JSON.stringify(data, null, 2)); } catch {}
};

const previewContent = (content: unknown): string => {
  if (typeof content === "string") return content.slice(0, 300);
  if (Array.isArray(content)) {
    return content
      .map((c: any) => {
        if (c?.type === "text") return c.text ?? "";
        if (c?.type === "toolCall") return `[toolCall:${c.name}]`;
        if (c?.type === "thinking") return `[thinking]`;
        if (c?.type === "image") return `[image:${c.mimeType}]`;
        return `[${c?.type ?? "unknown"}]`;
      })
      .join("\n")
      .slice(0, 300);
  }
  return "";
};

interface EntryWithMessage {
  entry: { id: string; type: string };
  message: { role: string; content: unknown };
}

function buildOwnCut(branchEntries: any[]): { messages: any[]; firstKeptEntryId: string } | null {
  // Find the last compaction entry and its firstKeptEntryId
  let lastCompactionIdx = -1;
  let lastKeptId: string | undefined;
  for (let i = branchEntries.length - 1; i >= 0; i--) {
    if (branchEntries[i].type === "compaction") {
      lastCompactionIdx = i;
      lastKeptId = branchEntries[i].firstKeptEntryId;
      break;
    }
  }

  // Collect live messages: either from firstKeptEntryId (if prev compaction exists)
  // or all messages (no prior compaction)
  const liveMessages: EntryWithMessage[] = [];
  let foundKept = !lastKeptId; // if no prior compaction, start collecting immediately
  for (const e of branchEntries) {
    if (!foundKept && e.id === lastKeptId) foundKept = true;
    if (!foundKept) continue;
    if (e.type === "compaction") continue; // skip the compaction entry itself
    if (e.type === "message" && e.message) {
      liveMessages.push({ entry: e, message: e.message });
    }
  }

  if (liveMessages.length <= 2) return null;

  // Summarize all messages, keep only the last user message as context
  let cutIdx = liveMessages.length - 1;

  // Align to last user message boundary
  while (cutIdx > 0 && liveMessages[cutIdx].message.role !== "user") {
    cutIdx--;
  }

  if (cutIdx <= 0) return null;

  return {
    messages: liveMessages.slice(0, cutIdx).map((e) => e.message),
    firstKeptEntryId: liveMessages[cutIdx].entry.id,
  };
}

export const registerBeforeCompactHook = (pi: ExtensionAPI) => {
  pi.on("session_before_compact", (event) => {
    const { preparation, branchEntries } = event;

    const ownCut = buildOwnCut(branchEntries as any[]);
    if (!ownCut) return { cancel: true };

    const agentMessages = ownCut.messages;
    const firstKeptEntryId = ownCut.firstKeptEntryId;
    const messages = convertToLlm(agentMessages);

    const config = loadConfig();

    const summary = compile({
      messages,
      previousSummary: preparation.previousSummary,
      fileOps: {
        readFiles: [...preparation.fileOps.read],
        modifiedFiles: [...preparation.fileOps.written, ...preparation.fileOps.edited],
      },
    });

    const branchIds = branchEntries.map((e: any) => e.id);
    const cutIdx = branchIds.indexOf(firstKeptEntryId);
    const cutWindow = cutIdx >= 0
      ? branchEntries.slice(Math.max(0, cutIdx - 3), Math.min(branchEntries.length, cutIdx + 3)).map((e: any) => ({
          id: e.id,
          type: e.type,
          role: e.type === "message" ? e.message?.role : undefined,
          preview: e.type === "message" ? previewContent(e.message?.content) : undefined,
        }))
      : [];

    dbg(config, {
      usedOwnCut: true,
      messagesToSummarize: agentMessages.length,
      messagesPreviewHead: agentMessages.slice(0, 3).map((m: any) => ({ role: m.role, preview: previewContent(m.content) })),
      messagesPreviewTail: agentMessages.slice(-3).map((m: any) => ({ role: m.role, preview: previewContent(m.content) })),
      convertedMessages: messages.length,
      firstKeptEntryId,
      cutWindow,
      tokensBefore: preparation.tokensBefore,
      summaryLength: summary.length,
      summaryPreview: summary.slice(0, 500),
      sections: [...summary.matchAll(/^\[(.+?)\]/gm)].map((m) => m[1]),
    });

    const details: PiVccCompactionDetails = {
      compactor: "pi-vcc",
      version: 1,
      sections: [...summary.matchAll(/^\[(.+?)\]/gm)].map((m) => m[1]),
      sourceMessageCount: agentMessages.length,
      previousSummaryUsed: Boolean(preparation.previousSummary),
    };

    return {
      compaction: {
        summary,
        details,
        tokensBefore: preparation.tokensBefore,
        firstKeptEntryId,
      },
    };
  });
};
