import { describe, test, expect } from "bun:test";
import { buildOwnCut } from "../src/hooks/before-compact";

const msg = (id: string, role: "user" | "assistant", content = "x") => ({
  id,
  type: "message",
  message: { role, content },
});

const comp = (id: string, firstKeptEntryId?: string) => ({
  id,
  type: "compaction",
  firstKeptEntryId,
});

describe("buildOwnCut", () => {
  test("no prior compaction: cuts at last user message", () => {
    const r = buildOwnCut([
      msg("m1", "user", "a"),
      msg("m2", "assistant", "b"),
      msg("m3", "user", "c"),
      msg("m4", "assistant", "d"),
    ]);
    expect(r).not.toBeNull();
    expect(r!.firstKeptEntryId).toBe("m3");
    expect(r!.messages).toHaveLength(2);
  });

  test("returns null when liveMessages <= 2", () => {
    const r = buildOwnCut([
      comp("c1", "m1"),
      msg("m1", "user", "x"),
      msg("m2", "assistant", "y"),
    ]);
    expect(r).toBeNull();
  });

  test("returns null when firstKeptEntryId is orphan (not in branch)", () => {
    const r = buildOwnCut([
      comp("c1", "ORPHAN_ID"),
      msg("m1", "user", "a"),
      msg("m2", "assistant", "b"),
      msg("m3", "user", "c"),
      msg("m4", "assistant", "d"),
    ]);
    expect(r).toBeNull();
  });

  test("resumes from firstKeptEntryId after prior compaction", () => {
    const r = buildOwnCut([
      msg("old1", "user", "old"),
      msg("old2", "assistant", "old"),
      comp("c1", "m1"),
      msg("m1", "user", "a"),
      msg("m2", "assistant", "b"),
      msg("m3", "user", "c"),
      msg("m4", "assistant", "d"),
    ]);
    expect(r).not.toBeNull();
    expect(r!.firstKeptEntryId).toBe("m3");
    expect(r!.messages).toHaveLength(2);
  });

  test("returns null when cutIdx resolves to 0 (first is user only)", () => {
    const r = buildOwnCut([
      msg("m1", "user", "only-user"),
      msg("m2", "assistant", "a"),
      msg("m3", "assistant", "b"),
    ]);
    expect(r).toBeNull();
  });
});
