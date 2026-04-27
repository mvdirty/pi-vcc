import { describe, expect, it } from "bun:test";
import { buildCompactionState, renderCompactionState } from "../src/core/compaction-state";
import type { SectionData } from "../src/sections";

const sectionData = (overrides: Partial<SectionData> = {}): SectionData => ({
  sessionGoal: [],
  currentScope: [],
  outstandingContext: [],
  filesAndChanges: [],
  commits: [],
  evidenceHandles: [],
  userPreferences: [],
  briefTranscript: "",
  transcriptEntries: [],
  ...overrides,
});

describe("compaction state", () => {
  it("renders current sections in deterministic order", () => {
    const state = buildCompactionState(sectionData({
      userPreferences: ["Use Docker for benchmarks"],
      sessionGoal: ["Benchmark compaction"],
      filesAndChanges: ["Modified: src/core/summarize.ts"],
      currentScope: ["Expose production layers"],
    }));

    const rendered = renderCompactionState(state);
    expect(rendered.layers.map((layer) => layer.name)).toEqual([
      "Pi VCC Session Goal",
      "Pi VCC Current Scope",
      "Pi VCC Files And Changes",
      "Pi VCC User Preferences",
    ]);
    expect(rendered.text.indexOf("[Session Goal]")).toBeLessThan(rendered.text.indexOf("[Current Scope]"));
    expect(rendered.text.indexOf("[Current Scope]")).toBeLessThan(rendered.text.indexOf("[Files And Changes]"));
  });

  it("keeps history and recall in separate trailing layers", () => {
    const state = buildCompactionState(sectionData({
      sessionGoal: ["Benchmark compaction"],
      briefTranscript: "[user]\nBenchmark compaction",
    }));

    const rendered = renderCompactionState(state, { includeRecallNote: true });
    expect(rendered.layers.map((layer) => [layer.name, layer.role])).toEqual([
      ["Pi VCC Session Goal", "current"],
      ["Pi VCC Brief Transcript", "history"],
      ["Pi VCC Recall Note", "recall"],
    ]);
    expect(rendered.text).toContain("\n\n---\n\n[user]\nBenchmark compaction");
    expect(rendered.text).toContain("\n\n---\n\nUse `vcc_recall`");
  });

  it("renders empty state as empty text without a recall-only layer", () => {
    const rendered = renderCompactionState(buildCompactionState(sectionData()), { includeRecallNote: true });
    expect(rendered.text).toBe("");
    expect(rendered.layers).toEqual([]);
  });
});
