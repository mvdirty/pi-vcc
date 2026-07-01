export const DEFAULT_CHARS_PER_TOKEN = 4;
export const MIN_CHARS_PER_TOKEN = 2;
export const MAX_CHARS_PER_TOKEN = 6;

export type TokenEstimateMode = "heuristic" | "calibrated";

export interface TokenEstimateCalibration {
  mode: TokenEstimateMode;
  charsPerToken: number;
  sourceChars?: number;
  sourceTokens?: number;
  rawCharsPerToken?: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const calibrateCharsPerToken = (
  sourceChars: number,
  sourceTokens: number | undefined,
): TokenEstimateCalibration => {
  if (!sourceTokens || sourceTokens <= 0 || sourceChars <= 0) {
    return { mode: "heuristic", charsPerToken: DEFAULT_CHARS_PER_TOKEN };
  }

  const rawCharsPerToken = sourceChars / sourceTokens;
  if (!Number.isFinite(rawCharsPerToken) || rawCharsPerToken <= 0) {
    return { mode: "heuristic", charsPerToken: DEFAULT_CHARS_PER_TOKEN };
  }

  return {
    mode: "calibrated",
    charsPerToken: clamp(rawCharsPerToken, MIN_CHARS_PER_TOKEN, MAX_CHARS_PER_TOKEN),
    sourceChars,
    sourceTokens,
    rawCharsPerToken,
  };
};

export const estimateTokensFromChars = (
  chars: number,
  charsPerToken = DEFAULT_CHARS_PER_TOKEN,
): number => Math.ceil(chars / charsPerToken);

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

export const estimateMessageContentTokens = (
  content: unknown,
  charsPerToken = DEFAULT_CHARS_PER_TOKEN,
): number => estimateTokensFromChars(estimateMessageContentChars(content), charsPerToken);
