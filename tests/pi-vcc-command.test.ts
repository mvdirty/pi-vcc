import { describe, expect, test } from "bun:test";
import { registerPiVccCommand } from "../src/commands/pi-vcc";
import { PI_VCC_COMPACT_INSTRUCTION } from "../src/hooks/before-compact";

type CompactOptions = {
  customInstructions?: string;
  onComplete?: () => void;
  onError?: (err: Error) => void;
};

function createHarness(sendUserMessage?: (content: string | unknown[]) => unknown) {
  let handler: ((args: string, ctx: any) => Promise<void>) | undefined;
  const compactCalls: CompactOptions[] = [];
  const notifyCalls: Array<{ msg: string; level: string }> = [];
  const userMessages: Array<string | unknown[]> = [];

  const pi = {
    registerCommand: (name: string, command: { handler: typeof handler }) => {
      expect(name).toBe("pi-vcc");
      handler = command.handler;
    },
    sendUserMessage: sendUserMessage ?? ((content: string | unknown[]) => {
      userMessages.push(content);
    }),
  } as any;

  const ctx = {
    compact: (options: CompactOptions) => {
      compactCalls.push(options);
    },
    ui: {
      notify: (msg: string, level: string) => {
        notifyCalls.push({ msg, level });
      },
    },
  };

  registerPiVccCommand(pi);

  return {
    invoke: async (args = "") => handler!(args, ctx),
    compactCalls,
    notifyCalls,
    userMessages,
  };
}

describe("registerPiVccCommand", () => {
  test("uses the pi-vcc compaction marker", async () => {
    const { invoke, compactCalls } = createHarness();

    await invoke();

    expect(compactCalls).toHaveLength(1);
    expect(compactCalls[0].customInstructions).toBe(PI_VCC_COMPACT_INSTRUCTION);
  });

  test("parses keep token at the start of args and strips it from the prompt", async () => {
    const { invoke, compactCalls, userMessages } = createHarness();

    await invoke("keep:3   continue  ");

    expect(compactCalls[0].customInstructions).toBe(`${PI_VCC_COMPACT_INSTRUCTION} keep:3`);
    compactCalls[0].onComplete?.();
    expect(userMessages).toEqual(["continue"]);
  });

  test("parses keep token at the end of args and strips it from the prompt", async () => {
    const { invoke, compactCalls, userMessages } = createHarness();

    await invoke("  continue   keep:2");

    expect(compactCalls[0].customInstructions).toBe(`${PI_VCC_COMPACT_INSTRUCTION} keep:2`);
    compactCalls[0].onComplete?.();
    expect(userMessages).toEqual(["continue"]);
  });

  test("sends trailing prompt as a user message after successful compaction", async () => {
    const { invoke, compactCalls, userMessages } = createHarness();

    await invoke("  continue  ");

    expect(userMessages).toHaveLength(0);
    compactCalls[0].onComplete?.();

    expect(userMessages).toEqual(["continue"]);
  });

  test("handles rejected follow-up send without throwing", async () => {
    const { invoke, compactCalls } = createHarness(() => Promise.reject(new Error("send failed")));

    await invoke("continue");

    expect(() => compactCalls[0].onComplete?.()).not.toThrow();
    await Promise.resolve();
  });

  test("skips follow-up when trailing prompt is empty", async () => {
    const { invoke, compactCalls, userMessages } = createHarness();

    await invoke("   ");
    compactCalls[0].onComplete?.();

    expect(userMessages).toHaveLength(0);
  });

  test("does not send trailing prompt on compaction error", async () => {
    const { invoke, compactCalls, userMessages, notifyCalls } = createHarness();

    await invoke("continue");
    compactCalls[0].onError?.(new Error("Already compacted"));

    expect(userMessages).toHaveLength(0);
    expect(notifyCalls).toEqual([{ msg: "Nothing to compact", level: "warning" }]);
  });

  test("normalizes huge keep tokens to a safe integer instruction", async () => {
    const { invoke, compactCalls } = createHarness();

    await invoke("keep:999999999999999999999 continue");

    expect(compactCalls[0].customInstructions).toBe(`${PI_VCC_COMPACT_INSTRUCTION} keep:${Number.MAX_SAFE_INTEGER}`);
  });
});
