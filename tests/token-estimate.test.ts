import { describe, expect, test } from "bun:test";
import { estimateMessageContentChars, estimateMessageContentTokens, estimateTokensFromChars } from "../src/core/token-estimate";

describe("token estimate", () => {
  test("estimates tokens from chars with ceil to avoid undercounting", () => {
    expect(estimateTokensFromChars(0)).toBe(0);
    expect(estimateTokensFromChars(1)).toBe(1);
    expect(estimateTokensFromChars(4)).toBe(1);
    expect(estimateTokensFromChars(5)).toBe(2);
  });

  test("estimates message content chars from strings and content parts", () => {
    expect(estimateMessageContentChars("hello")).toBe(5);
    expect(estimateMessageContentChars([
      { type: "text", text: "hello" },
      { type: "toolCall", name: "read", input: { path: "a.ts" } },
      { type: "toolResult", content: "done" },
      { type: "image", mimeType: "image/png" },
    ])).toBe(5 + 4 + JSON.stringify({ path: "a.ts" }).length + 4);
  });

  test("estimates message content tokens through the shared char estimator", () => {
    expect(estimateMessageContentTokens("abcde")).toBe(2);
  });
});
