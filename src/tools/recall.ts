import { Type } from "@sinclair/typebox";
import { readFileSync } from "fs";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { renderMessage } from "../core/render-entries";
import { searchEntries } from "../core/search-entries";
import { formatRecallOutput } from "../core/format-recall";

const DEFAULT_RECENT = 25;
const PAGE_SIZE = 5;

const loadAllMessages = (sessionFile: string, full: boolean) => {
  const content = readFileSync(sessionFile, "utf-8");
  const entries: any[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {}
  }
  const messageEntries = entries.filter((e) => e.type === "message" && e.message);
  const rendered = messageEntries.map((e, i) => renderMessage(e.message, i, full));
  const rawMessages = messageEntries.map((e) => e.message);
  return { rendered, rawMessages };
};

export const registerRecallTool = (pi: ExtensionAPI) => {
  pi.registerTool({
    name: "vcc_recall",
    label: "VCC Recall",
    description:
      "Search full conversation history in this session, including before compaction." +
      " Use without query to see recent brief history." +
      " Use with query to search all history. Query supports regex (e.g. 'hook|inject', 'fail.*build')." +
      " Multi-word queries use OR logic ranked by relevance — use keywords, not full sentences." +
      " Use expand with entry indices to get full content (note: some tool results may already be truncated by Pi core before saving)." +
      " Search returns 5 results per page — use page:N for more.",
    promptSnippet:
      "vcc_recall: Search full conversation history including compacted parts." +
      " Supports regex (e.g. 'hook|inject'). Multi-word = OR + ranked." +
      " Use expand:[indices] for full content.",
    parameters: Type.Object({
      query: Type.Optional(
        Type.String({ description: "Search terms or regex pattern (e.g. 'hook|inject', 'fail.*build'). Multi-word = OR ranked by relevance." }),
      ),
      expand: Type.Optional(
        Type.Array(Type.Number(), { description: "Entry indices to return full untruncated content for" }),
      ),
      page: Type.Optional(
        Type.Number({ description: "Page number (1-based) for paginated search results. Default: 1." }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!sessionFile) {
        return {
          content: [{ type: "text", text: "No session file available." }],
          details: undefined,
        };
      }

      const expandSet = new Set(params.expand ?? []);
      const hasExpand = expandSet.size > 0;

      if (hasExpand && !params.query) {
        const { rendered: fullMsgs } = loadAllMessages(sessionFile, true);
        const expanded = fullMsgs.filter((m) => expandSet.has(m.index));
        if (expanded.length === 0) {
          return {
            content: [{ type: "text", text: `No entries found for indices: ${[...expandSet].join(", ")}` }],
            details: undefined,
          };
        }
        const output = formatRecallOutput(expanded);
        return {
          content: [{ type: "text", text: output }],
          details: undefined,
        };
      }

      const { rendered: msgs, rawMessages } = loadAllMessages(sessionFile, false);
      const allResults = params.query?.trim()
        ? searchEntries(msgs, rawMessages, params.query)
        : msgs.slice(-DEFAULT_RECENT);

      if (params.query?.trim()) {
        const page = Math.max(1, params.page ?? 1);
        const start = (page - 1) * PAGE_SIZE;
        const pageResults = allResults.slice(start, start + PAGE_SIZE);
        const totalPages = Math.ceil(allResults.length / PAGE_SIZE);
        const header = totalPages > 1
          ? `Page ${page}/${totalPages} (${allResults.length} total matches)`
          : `${allResults.length} matches`;
        const footer = page < totalPages
          ? `\n--- Use page:${page + 1} for more results ---`
          : "";
        const output = formatRecallOutput(pageResults, params.query, header) + footer;
        return {
          content: [{ type: "text", text: output }],
          details: undefined,
        };
      }

      const output = formatRecallOutput(allResults, params.query);
      return {
        content: [{ type: "text", text: output }],
        details: undefined,
      };
    },
  });
};

