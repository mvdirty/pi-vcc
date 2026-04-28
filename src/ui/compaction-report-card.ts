import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Box, Spacer, Text } from "@mariozechner/pi-tui";
import {
  formatCompactionReportCard,
  PI_VCC_COMPACTION_REPORT_TYPE,
  type PiVccCompactionReport,
} from "../core/compaction-report";

const colorReportLine = (line: string, theme: any): string => {
  if (line.startsWith("! ")) return theme.fg("warning", line);
  if (line.startsWith("✓ ")) return theme.fg("success", line);
  if (line.startsWith("~ ") || line.startsWith("+ ")) return theme.fg("accent", line);
  if (line.startsWith("  ") || line.startsWith("- ")) return theme.fg("dim", line);
  return theme.fg("customMessageText", line);
};

const isReport = (value: unknown): value is PiVccCompactionReport =>
  typeof value === "object" && value !== null && (value as any).compactor === "pi-vcc";

export const registerCompactionReportCard = (pi: ExtensionAPI) => {
  pi.registerMessageRenderer<PiVccCompactionReport>(PI_VCC_COMPACTION_REPORT_TYPE, (message, options, theme) => {
    if (!isReport(message.details)) return undefined;

    const box = new Box(1, 1, (text: string) => theme.bg("customMessageBg", text));
    box.addChild(new Text(theme.fg("customMessageLabel", "\x1b[1m[pi-vcc]\x1b[22m"), 0, 0));
    box.addChild(new Spacer(1));

    const body = formatCompactionReportCard(message.details, { expanded: options.expanded })
      .split("\n")
      .map((line) => colorReportLine(line, theme))
      .join("\n");
    box.addChild(new Text(body, 0, 0));
    return box;
  });
};
