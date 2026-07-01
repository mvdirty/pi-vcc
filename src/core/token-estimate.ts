const APPROX_CHARS_PER_TOKEN = 4;

export const estimateTokensFromChars = (chars: number): number =>
  Math.ceil(chars / APPROX_CHARS_PER_TOKEN);

/** Estimate char length of a single message content (string or content-parts array). */
export const estimateMessageContentChars = (content: unknown): number => {
  if (typeof content === "string") return content.length;
  if (Array.isArray(content)) return content.reduce((sum: number, part: any) => {
    if (part.text) return sum + part.text.length;
    if (part.type === "toolCall") {
      const inputLength = typeof part.input === "string"
        ? part.input.length
        : JSON.stringify(part.input ?? "").length;
      return sum + (part.name?.length ?? 0) + inputLength;
    }
    if (part.type === "toolResult") {
      const contentLength = typeof part.content === "string"
        ? part.content.length
        : JSON.stringify(part.content ?? "").length;
      return sum + contentLength;
    }
    return sum;
  }, 0);
  return 0;
};

export const estimateMessageContentTokens = (content: unknown): number =>
  estimateTokensFromChars(estimateMessageContentChars(content));
