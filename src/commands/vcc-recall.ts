import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { loadAllMessages } from "../core/load-messages";
import { searchEntries } from "../core/search-entries";
import { formatRecallOutput } from "../core/format-recall";
import { getActiveLineageEntryIds } from "../core/lineage";

const PAGE_SIZE = 5;
const DEFAULT_RECENT = 25;

export const registerVccRecallCommand = (pi: ExtensionAPI) => {
  pi.registerCommand("pi-vcc-recall", {
    description: "Search conversation history (same as vcc_recall tool). Usage: /pi-vcc-recall <query> [page:N]",
    handler: async (args: string, ctx) => {
      const sessionFile = ctx.sessionManager.getSessionFile();
      if (!sessionFile) {
        ctx.ui.notify("No session file available.", "error");
        return;
      }

      const lineageEntryIds = getActiveLineageEntryIds(ctx.sessionManager);
      const raw = args.trim();
      if (!raw) {
        // No query: show recent
        const { rendered } = loadAllMessages(sessionFile, false, lineageEntryIds);
        const recent = rendered.slice(-DEFAULT_RECENT);
        const output = formatRecallOutput(recent);
        pi.sendMessage({ customType: "vcc-recall", content: output, display: true }, { triggerTurn: true });
        return;
      }

      // Parse page:N from args
      const pageMatch = raw.match(/\bpage:(\d+)\b/i);
      const page = pageMatch ? Math.max(1, parseInt(pageMatch[1], 10)) : 1;
      const query = raw.replace(/\bpage:\d+\b/i, "").trim();

      if (!query) {
        const { rendered } = loadAllMessages(sessionFile, false, lineageEntryIds);
        const recent = rendered.slice(-DEFAULT_RECENT);
        const output = formatRecallOutput(recent);
        pi.sendMessage({ customType: "vcc-recall", content: output, display: true }, { triggerTurn: true });
        return;
      }

      const { rendered, rawMessages } = loadAllMessages(sessionFile, false, lineageEntryIds);
      const allResults = searchEntries(rendered, rawMessages, query);

      const start = (page - 1) * PAGE_SIZE;
      const pageResults = allResults.slice(start, start + PAGE_SIZE);
      const totalPages = Math.ceil(allResults.length / PAGE_SIZE);
      const header = totalPages > 1
        ? `Page ${page}/${totalPages} (${allResults.length} total matches)`
        : `${allResults.length} matches`;
      const footer = page < totalPages
        ? `\n--- /pi-vcc-recall ${query} page:${page + 1} ---`
        : "";
      const output = formatRecallOutput(pageResults, query, header) + footer;
      pi.sendMessage({ customType: "vcc-recall", content: output, display: true }, { triggerTurn: true });
    },
  });
};
