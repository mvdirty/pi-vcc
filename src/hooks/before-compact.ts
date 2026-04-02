import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { convertToLlm } from "@mariozechner/pi-coding-agent";
import { writeFileSync } from "fs";
import { compile } from "../core/summarize";
import type { PiVccCompactionDetails } from "../details";

const dbg = (data: Record<string, unknown>) => {
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
  const postCompaction: EntryWithMessage[] = [];
  for (const e of branchEntries) {
    if (e.type === "compaction") {
      postCompaction.length = 0;
      continue;
    }
    if (e.type === "message" && e.message) {
      postCompaction.push({ entry: e, message: e.message });
    }
  }

  if (postCompaction.length <= 2) return null;

  // Summarize all messages, keep only the last user message as context
  let cutIdx = postCompaction.length - 1;

  // Align to last user message boundary
  while (cutIdx > 0 && postCompaction[cutIdx].message.role !== "user") {
    cutIdx--;
  }

  if (cutIdx <= 0) return null;

  return {
    messages: postCompaction.slice(0, cutIdx).map((e) => e.message),
    firstKeptEntryId: postCompaction[cutIdx].entry.id,
  };
}

export const registerBeforeCompactHook = (pi: ExtensionAPI) => {
  pi.on("session_before_compact", (event) => {
    const { preparation, customInstructions, branchEntries } = event;

    let agentMessages = preparation.messagesToSummarize;
    let firstKeptEntryId = preparation.firstKeptEntryId;

    // If pi-core's preparation has nothing to summarize, build our own cut
    if (agentMessages.length === 0) {
      const ownCut = buildOwnCut(branchEntries as any[]);
      if (ownCut) {
        agentMessages = ownCut.messages;
        firstKeptEntryId = ownCut.firstKeptEntryId;
      }
    }

    const messages = convertToLlm(agentMessages);

    const summary = compile({
      messages,
      previousSummary: preparation.previousSummary,
      fileOps: {
        readFiles: [...preparation.fileOps.read],
        modifiedFiles: [...preparation.fileOps.written, ...preparation.fileOps.edited],
      },
      customInstructions,
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

    dbg({
      usedOwnCut: agentMessages !== preparation.messagesToSummarize,
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
