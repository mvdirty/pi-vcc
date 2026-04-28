import type { PiVccCompactionReport } from "./core/compaction-report";

export interface PiVccCompactionDetails {
  compactor: "pi-vcc";
  version: number;
  sections: string[];
  sourceMessageCount: number;
  previousSummaryUsed: boolean;
  report?: PiVccCompactionReport;
}
