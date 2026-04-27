import { describe, expect, it } from "bun:test";
import { buildCompactionState, parseCompactionState, renderCompactionState } from "../src/core/compaction-state";
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
      "Pi VCC Files And Changes",
      "Pi VCC User Preferences",
      "Pi VCC Current Scope",
    ]);
    expect(rendered.text.indexOf("[Session Goal]")).toBeLessThan(rendered.text.indexOf("[Files And Changes]"));
    expect(rendered.text.indexOf("[User Preferences]")).toBeLessThan(rendered.text.indexOf("[Current Scope]"));
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

  it("renders recent preference and evidence sections after current scope", () => {
    const state = buildCompactionState(sectionData({
      sessionGoal: ["Benchmark compaction"],
      evidenceHandles: ["Paths: src/cache/probe.ts"],
      currentScope: ["Keep going"],
    }));
    state.current.recentScopeUpdates = ["Validate dashboards"];
    state.current.recentUserPreferences = ["Prefer query read only mode"];
    state.current.recentEvidenceHandles = ["Identifiers: req_cache_beta"];
    const rendered = renderCompactionState(state);
    expect(rendered.layers.map((layer) => layer.name)).toEqual([
      "Pi VCC Session Goal",
      "Pi VCC Evidence Handles",
      "Pi VCC Current Scope",
      "Pi VCC Recent Scope Updates",
      "Pi VCC Recent User Preferences",
      "Pi VCC Recent Evidence Handles",
    ]);
  });

  it("parses rendered summary back into structured state", () => {
    const rendered = renderCompactionState(buildCompactionState(sectionData({
      sessionGoal: ["Benchmark compaction"],
      currentScope: ["Expose production layers"],
      userPreferences: ["Use Docker for benchmarks"],
      briefTranscript: "[user]\nBenchmark compaction",
    })));

    const reparsed = renderCompactionState(parseCompactionState(rendered.text));
    expect(reparsed.text).toBe(rendered.text);
    expect(reparsed.layers.map((layer) => layer.name)).toEqual(rendered.layers.map((layer) => layer.name));
  });
});
