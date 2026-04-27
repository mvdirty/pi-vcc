import type { Message } from "@mariozechner/pi-ai";

export interface ExpectedTerm {
  label: string;
  term: string;
  /** Optional focused query for recall-style lookup. Defaults to the term. */
  query?: string;
}

export interface ScopedTerm extends ExpectedTerm {
  /** Enforce only after this term has appeared in the replayed source text. */
  afterTerm?: string;
}

export interface CompactionGold {
  /** Terms that should appear somewhere in the active prompt. */
  activeTerms: ExpectedTerm[];
  /** Terms that should appear in current-state layers, not only historical transcript/tail. */
  currentTerms?: ExpectedTerm[];
  /** Terms that should be recoverable from external recall. */
  recallTerms: ExpectedTerm[];
  /** Terms forbidden anywhere in the active prompt. */
  forbiddenTerms?: ScopedTerm[];
  /** Terms forbidden from current-state layers but allowed in historical layers or recall. */
  forbiddenCurrentTerms?: ScopedTerm[];
  /** Terms that must stay out of active prompt text because recall should carry them. */
  activeAbsentTerms?: ExpectedTerm[];
  continuationTerms?: ExpectedTerm[];
}

export interface CompactionBenchmarkCase {
  id: string;
  description: string;
  messages: Message[];
  /** Message counts at which to run a compaction cycle. */
  compactionPoints: number[];
  gold: CompactionGold;
}

const ts = 1_700_000_000_000;
let toolId = 0;

const assistantBase = {
  api: "messages" as any,
  provider: "anthropic" as any,
  model: "benchmark-fixture",
  usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  timestamp: ts,
};

const user = (text: string): Message => ({ role: "user", content: text, timestamp: ts });

const assistant = (text: string): Message => ({
  role: "assistant",
  content: [{ type: "text", text }],
  ...assistantBase,
  stopReason: "stop",
});

const toolCall = (name: string, args: Record<string, unknown>): Message => {
  toolId += 1;
  return {
    role: "assistant",
    content: [{ type: "toolCall", id: `bench_tool_${toolId}`, name, arguments: args }],
    ...assistantBase,
    stopReason: "toolUse",
  };
};

const toolResult = (name: string, text: string, isError = false): Message => ({
  role: "toolResult",
  toolCallId: `bench_tool_${toolId}`,
  toolName: name,
  content: [{ type: "text", text }],
  isError,
  timestamp: ts,
});

const noisyLog = (needle: string): string => [
  ...Array.from({ length: 80 }, (_, i) => `debug ${String(i).padStart(2, "0")}: cache warmup shard ok`),
  `CRITICAL ${needle}`,
  ...Array.from({ length: 80 }, (_, i) => `debug ${String(i + 80).padStart(2, "0")}: retry window unchanged`),
].join("\n");

export const syntheticCompactionCases: CompactionBenchmarkCase[] = [
  {
    id: "boundary-loss-auth-refresh",
    description: "A critical constraint and error signature appear immediately before a compaction cut.",
    messages: [
      user("Fix password-reset login. Hard constraint: do not change the public login API."),
      assistant("I will inspect the auth refresh path and keep the public login API unchanged."),
      toolCall("read", { path: "src/auth/session.ts" }),
      toolResult("read", "export function refreshSessionAfterPasswordReset() { return null; }"),
      assistant("The likely fix belongs in src/auth/session.ts, not the public login handler."),
      toolCall("bash", { command: "bun test tests/auth-refresh.test.ts" }),
      toolResult("bash", "FAIL tests/auth-refresh.test.ts\nERR_REFRESH_AFTER_RESET expired refresh token after password reset", true),
      user("Continue from here. The next step is to patch refreshSessionAfterPasswordReset, then rerun tests/auth-refresh.test.ts."),
      assistant("I will patch refreshSessionAfterPasswordReset and rerun the focused auth-refresh test."),
    ],
    compactionPoints: [7, 9],
    gold: {
      activeTerms: [
        { label: "constraint", term: "do not change the public login API" },
        { label: "file", term: "src/auth/session.ts" },
        { label: "identifier", term: "ERR_REFRESH_AFTER_RESET" },
      ],
      currentTerms: [
        { label: "constraint", term: "do not change the public login API" },
        { label: "file", term: "src/auth/session.ts" },
        { label: "identifier", term: "ERR_REFRESH_AFTER_RESET" },
      ],
      recallTerms: [
        { label: "failing test", term: "tests/auth-refresh.test.ts", query: "auth-refresh" },
      ],
      continuationTerms: [
        { label: "next edit", term: "patch refreshSessionAfterPasswordReset" },
        { label: "next validation", term: "rerun tests/auth-refresh.test.ts" },
      ],
    },
  },
  {
    id: "identifier-provenance",
    description: "Similar identifiers make exact provenance and active entity recovery important.",
    messages: [
      user("Audit cache invalidation. The target artifact is /tmp/cache-probe-A17.log, not /tmp/cache-probe-A71.log."),
      assistant("I will keep the A17 artifact distinct from the A71 decoy and check the cache probe IDs."),
      toolCall("read", { path: "/tmp/cache-probe-A17.log" }),
      toolResult("read", "probe_id=cache_probe_A17\nspan=spn_cache_keep_91\ncommit=9f3a2b1\nstatus=prefix preserved"),
      toolCall("read", { path: "/tmp/cache-probe-A71.log" }),
      toolResult("read", "probe_id=cache_probe_A71\nspan=spn_cache_drop_19\nstatus=decoy"),
      assistant("Decision: use cache_probe_A17 and span spn_cache_keep_91 as the evidence handle. Ignore cache_probe_A71."),
      user("Continue the audit using commit 9f3a2b1 and evidence span spn_cache_keep_91."),
    ],
    compactionPoints: [6, 8],
    gold: {
      activeTerms: [
        { label: "artifact", term: "/tmp/cache-probe-A17.log" },
        { label: "probe", term: "cache_probe_A17" },
        { label: "span", term: "spn_cache_keep_91" },
        { label: "commit", term: "9f3a2b1" },
      ],
      currentTerms: [
        { label: "artifact", term: "/tmp/cache-probe-A17.log" },
        { label: "probe", term: "cache_probe_A17" },
        { label: "span", term: "spn_cache_keep_91" },
        { label: "commit", term: "9f3a2b1" },
      ],
      recallTerms: [
        { label: "decoy provenance", term: "cache_probe_A71", query: "cache_probe_A71" },
      ],
      forbiddenCurrentTerms: [
        { label: "decoy as current target", term: "use cache_probe_A71", afterTerm: "Ignore cache_probe_A71" },
      ],
      continuationTerms: [
        { label: "continue span", term: "spn_cache_keep_91" },
      ],
    },
  },
  {
    id: "recall-required-bulk-log",
    description: "A bulky log should be externalized while retaining a pointer and recallable exact failure line.",
    messages: [
      user("Investigate a flaky compaction benchmark. Store bulky logs as pointers when possible."),
      assistant("I will inspect the benchmark log and keep only the evidence handle in active state."),
      toolCall("bash", { command: "./run-benchmark > /tmp/pi-vcc-bench-482.log" }),
      toolResult("bash", noisyLog("CACHE_MISS_AT_LAYER_2B request_id=req_cache_482"), true),
      assistant("The important pointer is /tmp/pi-vcc-bench-482.log. The exact line CACHE_MISS_AT_LAYER_2B request_id=req_cache_482 can be recalled from the log."),
      user("Continue with the pointer only; do not paste the whole log back into context."),
    ],
    compactionPoints: [4, 6],
    gold: {
      activeTerms: [
        { label: "log pointer", term: "/tmp/pi-vcc-bench-482.log" },
      ],
      currentTerms: [
        { label: "log pointer", term: "/tmp/pi-vcc-bench-482.log" },
      ],
      recallTerms: [
        { label: "critical line", term: "CACHE_MISS_AT_LAYER_2B request_id=req_cache_482", query: "CACHE_MISS_AT_LAYER_2B req_cache_482" },
      ],
      activeAbsentTerms: [
        { label: "early bulky log line", term: "debug 00: cache warmup shard ok" },
        { label: "late bulky log line", term: "debug 120: retry window unchanged" },
      ],
      continuationTerms: [
        { label: "pointer discipline", term: "do not paste the whole log" },
      ],
    },
  },
  {
    id: "correction-stale-memory",
    description: "A corrected user preference should replace stale durable memory.",
    messages: [
      user("For this repo, prefer yarn test when validating."),
      assistant("Noted: yarn test for validation."),
      toolCall("bash", { command: "yarn test" }),
      toolResult("bash", "yarn: command not found", true),
      user("Correction: never use yarn here. Use npm test for broad validation and node --test for focused checks."),
      assistant("Understood. I will avoid yarn and use npm test or node --test depending on scope."),
      user("Continue and choose the focused validation command first."),
    ],
    compactionPoints: [4, 7],
    gold: {
      activeTerms: [
        { label: "corrected preference", term: "never use yarn" },
        { label: "broad validation", term: "npm test" },
        { label: "focused validation", term: "node --test" },
      ],
      currentTerms: [
        { label: "corrected preference", term: "never use yarn" },
        { label: "broad validation", term: "npm test" },
        { label: "focused validation", term: "node --test" },
      ],
      recallTerms: [
        { label: "failed old tool", term: "yarn: command not found", query: "yarn command not found" },
      ],
      forbiddenCurrentTerms: [
        { label: "stale positive preference", term: "prefer yarn test", afterTerm: "Correction: never use yarn here" },
      ],
      continuationTerms: [
        { label: "focused command", term: "node --test" },
      ],
    },
  },
  {
    id: "realistic-scope-and-status",
    description: "A real-session-shaped scope extension should be captured, but follow-up status should stay volatile.",
    messages: [
      user("Build a local ClickHouse-based OpenTelemetry ingestion and query system."),
      assistant("I will start with local ClickHouse, ingestion, and query scaffolding."),
      user("Good, now lets add meta monitoring for the chart itself. This means metrics for our clickhouse instance and dashboards for grafana."),
      assistant("I will extend the current work with meta monitoring and Grafana dashboards."),
      user("Status update: meta monitoring wiring is started; next validate dashboard provisioning."),
      assistant("Next step: validate dashboard provisioning without changing the stable objective."),
    ],
    compactionPoints: [2, 4, 6],
    gold: {
      activeTerms: [
        { label: "original objective", term: "OpenTelemetry ingestion and query system" },
        { label: "scope extension", term: "meta monitoring" },
      ],
      currentTerms: [
        { label: "original objective", term: "OpenTelemetry ingestion and query system" },
        { label: "scope extension", term: "meta monitoring" },
      ],
      recallTerms: [
        { label: "dashboard validation", term: "dashboard provisioning", query: "dashboard provisioning" },
      ],
      continuationTerms: [
        { label: "volatile next step", term: "validate dashboard provisioning" },
      ],
    },
  },
  {
    id: "cache-bust-volatile-next-step",
    description: "Stable objective and identifiers remain fixed while only volatile next-step state changes across cycles.",
    messages: [
      user("Benchmark cache-aware compaction. Stable objective: preserve Layer 0 and Layer 1 prefixes."),
      assistant("Stable checkpoint: objective preserve Layer 0 and Layer 1 prefixes; identifier cache_schema_v3."),
      user("Current blocker: first run lacks cached input token accounting."),
      assistant("Next step: add offline LCP token metrics for cache_schema_v3."),
      user("Blocker update: offline LCP metrics are done; now add recall top-k metrics."),
      assistant("Next step: add recall top-k metrics while preserving cache_schema_v3 stable text."),
      user("Blocker update: recall top-k metrics are done; now document live provider limits."),
      assistant("Next step: document live provider limits without changing Layer 0 or Layer 1 wording."),
    ],
    compactionPoints: [4, 6, 8],
    gold: {
      activeTerms: [
        { label: "stable objective", term: "preserve Layer 0 and Layer 1 prefixes" },
        { label: "schema", term: "cache_schema_v3" },
      ],
      currentTerms: [
        { label: "stable objective", term: "preserve Layer 0 and Layer 1 prefixes" },
        { label: "schema", term: "cache_schema_v3" },
      ],
      recallTerms: [
        { label: "old blocker", term: "first run lacks cached input token accounting", query: "cached input token accounting" },
      ],
      continuationTerms: [
        { label: "latest next step", term: "document live provider limits" },
      ],
    },
  },
];
