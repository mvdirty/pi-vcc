import { describe, expect, it } from "bun:test";
import { compile, compileRanked } from "../src/core/summarize";
import { rankBriefBlocks, selectRankedBriefBlocks } from "../src/core/rank";
import type { NormalizedBlock } from "../src/types";
import { assistantText, assistantWithToolCall, userMsg } from "./fixtures";

const briefPart = (summary: string): string => summary.split("\n\n---\n\n")[1] ?? "";

describe("section-aware brief ranking prototype", () => {
  it("scores structural edit/test events above read-only exploration", () => {
    const blocks: NormalizedBlock[] = [
      { kind: "tool_call", name: "Read", args: { file_path: "src/auth.ts" } },
      { kind: "tool_call", name: "Edit", args: { file_path: "src/auth.ts" } },
      { kind: "tool_call", name: "bash", args: { command: "bun test tests/auth.test.ts" } },
    ];

    const ranked = rankBriefBlocks(blocks);
    const read = ranked.find((r) => r.block.kind === "tool_call" && r.block.name === "Read")!;
    const edit = ranked.find((r) => r.block.kind === "tool_call" && r.block.name === "Edit")!;
    const test = ranked.find((r) => r.block.kind === "tool_call" && r.block.name === "bash")!;

    expect(edit.score).toBeGreaterThan(read.score);
    expect(test.score).toBeGreaterThan(read.score);
    expect(edit.reasons).toContain("edit-tool");
    expect(test.reasons).toContain("test-command");
  });

  it("selects ranked blocks chronologically after scoring", () => {
    const blocks: NormalizedBlock[] = [
      { kind: "tool_call", name: "Read", args: { file_path: "noise-a.ts" } },
      { kind: "tool_call", name: "Read", args: { file_path: "noise-b.ts" } },
      { kind: "user", text: "Fix auth bug" },
      { kind: "assistant", text: "Root cause is stale token refresh." },
      { kind: "tool_call", name: "Edit", args: { file_path: "src/auth.ts" } },
      { kind: "tool_call", name: "bash", args: { command: "bun test tests/auth.test.ts" } },
    ];

    const selected = selectRankedBriefBlocks(blocks, { maxBlocks: 4, preserveRecentBlocks: 1 });

    expect(selected).toEqual([
      blocks[2],
      blocks[3],
      blocks[4],
      blocks[5],
    ]);
  });

  it("compileRanked reduces brief noise while keeping semantic sections from all blocks", () => {
    const exploration = Array.from({ length: 15 }, (_, i) => [
      userMsg(`look around ${i}`),
      assistantWithToolCall("Read", { file_path: `noise${i}.ts` }),
    ]).flat();
    const critical = [
      userMsg("Fix auth bug"),
      assistantText("Root cause is stale token refresh."),
      assistantWithToolCall("Edit", { file_path: "src/auth.ts" }),
      assistantWithToolCall("bash", { command: "bun test tests/auth.test.ts" }),
      assistantText("Fixed auth bug and tests passed."),
    ];

    const baseline = compile({ messages: [...exploration, ...critical] });
    const ranked = compileRanked({
      messages: [...exploration, ...critical],
      ranking: { maxBlocks: 10, preserveRecentBlocks: 4 },
    });

    expect(ranked.length).toBeLessThan(baseline.length);
    expect(ranked).toContain("[Session Goal]");
    expect(ranked).toContain("Fix auth bug");
    expect(ranked).toContain('* Edit "src/auth.ts"');
    expect(ranked).toContain('* bash "bun test tests/auth.test.ts"');
    expect(briefPart(ranked)).not.toContain('Read "noise0.ts"');
  });

  it("keeps fresh ranked brief and gives previous brief the remaining budget", () => {
    const previousBrief = Array.from({ length: 200 }, (_, i) => `[user]\nold context ${i}`).join("\n\n");
    const previousSummary = `[Session Goal]\n- Original goal\n\n---\n\n${previousBrief}`;
    const ranked = compileRanked({
      previousSummary,
      messages: [
        userMsg("Fix fresh ranked bug"),
        assistantText("Fresh ranked root cause should survive merge."),
        assistantWithToolCall("Edit", { file_path: "src/fresh.ts" }),
        assistantWithToolCall("bash", { command: "bun test tests/fresh.test.ts" }),
        assistantText("Fresh ranked fix passed tests."),
      ],
      ranking: { maxBlocks: 5, preserveRecentBlocks: 2 },
    });

    expect(ranked).toContain("Fresh ranked root cause should survive merge.");
    expect(ranked).toContain('* Edit "src/fresh.ts"');
    expect(ranked).toContain('* bash "bun test tests/fresh.test.ts"');
    expect(ranked).toContain("Fresh ranked fix passed tests.");
    expect(ranked).toContain("old context 199");
    expect(ranked).not.toContain("old context 0");
  });
});
