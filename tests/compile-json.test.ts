import { describe, it, expect } from "bun:test";
import { compile } from "../src/core/summarize";
import {
  userMsg,
  assistantText,
  assistantWithToolCall,
  toolResult,
} from "./fixtures";
import type { JsonSummary } from "../src/core/format";
import type { CompactEntry } from "../src/core/brief";

const parseJson = (s: string): JsonSummary => JSON.parse(s);

// Helpers for reading compact tuples
// Format: [role, text, tool?, ref?, count?]
const role = (e: CompactEntry) => e[0];
const text = (e: CompactEntry) => e[1];
const tool = (e: CompactEntry) => e[2];
const ref = (e: CompactEntry) => e[3];
const count = (e: CompactEntry) => e[4];

describe("compile format=json", () => {
  it("returns valid JSON for no messages", () => {
    const r = compile({ messages: [], format: "json" });
    const obj = parseJson(r);
    expect(obj.sessionGoal).toEqual([]);
    expect(obj.transcript).toEqual([]);
  });

  it("produces valid JSON with correct keys", () => {
    const r = compile({
      messages: [
        userMsg("Fix login bug"),
        assistantWithToolCall("Read", { path: "auth.ts" }),
        assistantText("Found the issue."),
      ],
      format: "json",
    });
    const obj = parseJson(r);
    expect(obj.sessionGoal).toBeArray();
    expect(obj.filesAndChanges).toBeArray();
    expect(obj.outstandingContext).toBeArray();
    expect(obj.userPreferences).toBeArray();
    expect(obj.transcript).toBeArray();
    expect(obj.note).toContain("vcc_recall");
  });

  it("transcript contains compact tuple entries", () => {
    const r = compile({
      messages: [
        userMsg("Fix login bug"),
        assistantWithToolCall("bash", { command: "bun test" }),
        assistantText("Tests pass."),
      ],
      format: "json",
    });
    const obj = parseJson(r);

    // User entry
    const userEntry = obj.transcript.find((e) => role(e) === "u");
    expect(userEntry).toBeDefined();
    expect(text(userEntry!)).toContain("Fix login bug");

    // Tool call entry: ["a", "bun test (#N)", "bash"]
    const toolEntry = obj.transcript.find((e) => tool(e) === "bash");
    expect(toolEntry).toBeDefined();
    expect(role(toolEntry!)).toBe("a");
    expect(text(toolEntry!)).toContain("bun test");

    // Assistant text entry
    const asstEntry = obj.transcript.find(
      (e) => role(e) === "a" && !tool(e) && text(e)?.includes("Tests pass")
    );
    expect(asstEntry).toBeDefined();
  });

  it("tool errors appear in transcript as 'e' role", () => {
    const r = compile({
      messages: [
        userMsg("run it"),
        assistantWithToolCall("bash", { command: "exit 1" }),
        toolResult("bash", "command failed", true),
      ],
      format: "json",
    });
    const obj = parseJson(r);
    const err = obj.transcript.find((e) => role(e) === "e");
    expect(err).toBeDefined();
    expect(tool(err!)).toBe("bash");
    expect(text(err!)).toContain("command failed");
  });

  it("merges JSON previous summary", () => {
    const fresh = compile({
      messages: [userMsg("First task")],
      format: "json",
    });
    const merged = compile({
      messages: [userMsg("Second task")],
      previousSummary: fresh,
      format: "json",
    });
    const obj = parseJson(merged);
    expect(obj.sessionGoal).toContain("First task");
    expect(obj.sessionGoal).toContain("Second task");
    // Transcript should have entries from both
    const userTexts = obj.transcript.filter((e) => role(e) === "u").map((e) => text(e));
    expect(userTexts.some((t) => t?.includes("First task"))).toBe(true);
    expect(userTexts.some((t) => t?.includes("Second task"))).toBe(true);
  });

  it("outstanding context is volatile on merge", () => {
    const prev: JsonSummary = {
      sessionGoal: ["goal"],
      filesAndChanges: [],
      outstandingContext: ["old blocker"],
      userPreferences: [],
      transcript: [["u", "hi"]],
      note: "",
    };
    const merged = compile({
      messages: [userMsg("continue")],
      previousSummary: JSON.stringify(prev),
      format: "json",
    });
    const obj = parseJson(merged);
    expect(obj.outstandingContext).not.toContain("old blocker");
  });

  it("caps transcript on merge", () => {
    const longTranscript: CompactEntry[] = Array.from({ length: 200 }, (_, i) =>
      ["u", `message ${i}`] as CompactEntry
    );
    const prev: JsonSummary = {
      sessionGoal: ["goal"],
      filesAndChanges: [],
      outstandingContext: [],
      userPreferences: [],
      transcript: longTranscript,
      note: "",
    };
    const merged = compile({
      messages: [userMsg("latest")],
      previousSummary: JSON.stringify(prev),
      format: "json",
    });
    const obj = parseJson(merged);
    // Should be capped at 120 + 1 omission marker
    expect(obj.transcript.length).toBeLessThanOrEqual(122);
    expect(text(obj.transcript[0])).toContain("earlier entries omitted");
    // Latest should be present
    const last = obj.transcript[obj.transcript.length - 1];
    expect(text(last)).toContain("latest");
  });
});
