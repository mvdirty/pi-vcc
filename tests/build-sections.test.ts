import { describe, it, expect } from "bun:test";
import { buildSections } from "../src/core/build-sections";
import type { NormalizedBlock } from "../src/types";

describe("buildSections", () => {
  it("returns all-empty for no blocks", () => {
    const r = buildSections({ blocks: [] });
    expect(r.sessionGoal).toEqual([]);
    expect(r.actionsTaken).toEqual([]);
    expect(r.filesRead).toEqual([]);
  });

  it("populates sections from realistic blocks", () => {
    const blocks: NormalizedBlock[] = [
      { kind: "user", text: "Fix the auth bug" },
      { kind: "tool_call", name: "Read", args: { path: "auth.ts" } },
      { kind: "tool_result", name: "Read", text: "export function auth() { return checkToken(req.headers.authorization); }", isError: false },
      { kind: "assistant", text: "The root cause is a null check" },
      { kind: "tool_call", name: "Edit", args: { path: "auth.ts" } },
      { kind: "tool_result", name: "Edit", text: "ok", isError: false },
      { kind: "assistant", text: "- run tests next" },
    ];
    const r = buildSections({ blocks });
    expect(r.sessionGoal).toContain("Fix the auth bug");
    expect(r.filesRead).toContain("auth.ts");
    expect(r.filesModified).toContain("auth.ts");
    expect(r.actionsTaken.length).toBeGreaterThan(0);
    expect(r.actionsTaken[0]).toContain("auth.ts");
    expect(r.importantEvidence.length).toBeGreaterThan(0);
    expect(r.importantEvidence[0]).toContain("[Read]");
    expect(r.keyConversationTurns.length).toBeGreaterThan(0);
    expect(r.keyConversationTurns.some((t) => t.startsWith("[user]"))).toBe(true);
    expect(r.keyConversationTurns.some((t) => t.startsWith("[assistant]"))).toBe(true);
  });

  it("uses fileOps to seed file lists", () => {
    const r = buildSections({
      blocks: [],
      fileOps: { readFiles: ["x.ts"], modifiedFiles: ["y.ts"] },
    });
    expect(r.filesRead).toContain("x.ts");
    expect(r.filesModified).toContain("y.ts");
  });

  it("collapses repeated tool calls", () => {
    const blocks: NormalizedBlock[] = [
      { kind: "tool_call", name: "Read", args: { path: "a.ts" } },
      { kind: "tool_call", name: "Read", args: { path: "a.ts" } },
      { kind: "tool_call", name: "Read", args: { path: "a.ts" } },
    ];
    const r = buildSections({ blocks });
    expect(r.actionsTaken.length).toBe(1);
    expect(r.actionsTaken[0]).toContain("x3");
  });
});

