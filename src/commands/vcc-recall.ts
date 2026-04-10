import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { readFileSync } from "fs";
import { renderMessage } from "../core/render-entries";
import { searchEntries } from "../core/search-entries";
import { formatRecallOutput } from "../core/format-recall";

const PAGE_SIZE = 5;
const DEFAULT_RECENT = 25;

const loadAllMessages = (sessionFile: string, full: boolean) => {
  const content = readFileSync(sessionFile, "utf-8");
  const entries: any[] = [];
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try { entries.push(JSON.parse(line)); } catch {}
  }
  const messageEntries = entries.filter((e) => e.type === "message" && e.message);
  const rendered = messageEntries.map((e, i) => renderMessage(e.message, i, full));
  const rawMessages = messageEntries.map((e) => e.message);
  return { rendered, rawMessages };
};

export const registerVccRecallCommand = (pi: ExtensionAPI) => {
  pi.registerCommand("vcc-recall", {
    description: "Search conversation history (same as vcc_recall tool). Usage: /vcc-recall <query> [page:N]",
    handler: async (args: string, ctx) => {
      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!sessionFile) {
        ctx.ui.notify("No session file available.", "error");
        return;
      }

      const raw = args.trim();
      if (!raw) {
        // No query: show recent
        const { rendered } = loadAllMessages(sessionFile, false);
        const recent = rendered.slice(-DEFAULT_RECENT);
        const output = formatRecallOutput(recent);
        pi.sendMessage({ customType: "vcc-recall", content: output, display: true });
        return;
      }

      // Parse page:N from args
      const pageMatch = raw.match(/\bpage:(\d+)\b/i);
      const page = pageMatch ? Math.max(1, parseInt(pageMatch[1], 10)) : 1;
      const query = raw.replace(/\bpage:\d+\b/i, "").trim();

      if (!query) {
        const { rendered } = loadAllMessages(sessionFile, false);
        const recent = rendered.slice(-DEFAULT_RECENT);
        const output = formatRecallOutput(recent);
        pi.sendMessage({ customType: "vcc-recall", content: output, display: true });
        return;
      }

      const { rendered, rawMessages } = loadAllMessages(sessionFile, false);
      const allResults = searchEntries(rendered, rawMessages, query);

      const start = (page - 1) * PAGE_SIZE;
      const pageResults = allResults.slice(start, start + PAGE_SIZE);
      const totalPages = Math.ceil(allResults.length / PAGE_SIZE);
      const header = totalPages > 1
        ? `Page ${page}/${totalPages} (${allResults.length} total matches)`
        : `${allResults.length} matches`;
      const footer = page < totalPages
        ? `\n--- /vcc-recall ${query} page:${page + 1} ---`
        : "";
      const output = formatRecallOutput(pageResults, query, header) + footer;
      pi.sendMessage({ customType: "vcc-recall", content: output, display: true });
    },
  });
};
