# pi-vcc

[![npm](https://img.shields.io/npm/v/@sting8k/pi-vcc)](https://www.npmjs.com/package/@sting8k/pi-vcc)

Algorithmic conversation compactor for [Pi](https://github.com/badlogic/pi-mono). No LLM calls — produces a brief transcript via extraction and formatting.

Inspired by [VCC](https://github.com/lllyasviel/VCC) **(View-oriented Conversation Compiler)**.

## Demo

![pi-vcc demo](./demo.gif)

## Why pi-vcc

|  | Pi default | pi-vcc |
|---|---|---|
| **Method** | LLM-generated summary | Algorithmic extraction, no LLM |
| **Determinism** | Non-deterministic, can hallucinate | Same input = same output, always |
| **Token reduction** | Varies | 35-99% on real sessions (higher on longer sessions) |
| **Compaction latency** | Waits for LLM call | 30-470ms, no API calls |
| **History after compaction** | Gone — agent only sees summary | Active lineage searchable via `vcc_recall` (`scope:"all"` available) |
| **Repeated compactions** | Each rewrite risks losing more | Sections merge and accumulate |
| **Cost** | Burns tokens on summarization call | Zero — no API calls |
| **Structure** | Free-form prose | Brief transcript + 4 semantic sections |

## Features

- **No LLM** — purely algorithmic, zero extra API cost
- **Brief transcript** — chronological conversation flow, each tool call collapsed to a one-liner with `(#N)` refs, text truncated to keep it compact
- **5 semantic sections** — session goal, files & changes, commits, outstanding context, user preferences
- **Bounded merge** — rolling sections re-capped after merge instead of growing unbounded
- **Lossless recall** — `vcc_recall` reads raw session JSONL, so active-lineage history stays searchable across compactions
- **Scoped recall** — default search is active lineage; use `scope:"all"` / `scope:all` to intentionally search across all lineages
- **Regex search** — `vcc_recall` supports regex patterns (`hook|inject`, `fail.*build`) and OR-ranked multi-word queries
- **Result ranking** — search results ranked by term relevance, rare terms weighted higher than common ones
- **`/pi-vcc-recall`** — slash command to search history directly, results shown as collapsible message and auto-fed to agent as context
- **Fallback cut** — still works when Pi core returns nothing to summarize
- **`/pi-vcc`** — manual compaction on demand

## Install

```bash
pi install npm:@sting8k/pi-vcc
```

Or from GitHub:

```bash
pi install https://github.com/sting8k/pi-vcc
```

Or try without installing:

```bash
pi -e https://github.com/sting8k/pi-vcc
```

## Usage

Once installed, pi-vcc registers a `session_before_compact` hook.

- Run `/pi-vcc` to trigger pi-vcc compaction manually.
- Optional keep syntax: `/pi-vcc keep:3 <prompt>` or `/pi-vcc <prompt> keep:3`.
  - `keep:1` matches the default behavior.
  - `keep:0` compacts everything and keeps no tail.
- By default, `/compact` and auto-threshold compactions still go through pi core (LLM-based). Set `overrideDefaultCompaction: true` in the config to let pi-vcc handle all compaction paths.
- To search older active-lineage history after compaction, use `vcc_recall`.
- To intentionally search across all lineages, pass `scope:"all"` to `vcc_recall` or run `/pi-vcc-recall <query> scope:all`.
- To search and feed results to agent yourself, run `/pi-vcc-recall <query> [page:N]`.
  - Tip: type `/recall` and Pi will autocomplete to `/pi-vcc-recall`.

### How compaction works

Pi splits the conversation at the **last user message** by default. Everything after — the **kept tail** — stays intact and untouched. With `keep:N`, pi-vcc keeps the last `N` user turns in that tail and summarizes everything before the cut point. If `keep:0` is requested, it compacts everything and keeps no tail.

### Compacted message structure

```
[Session Goal]
- Fix the authentication bug in login flow
- [Scope change]
- Also update the session token refresh logic

[Files And Changes]
- Modified: src/auth/session.ts
- Created: tests/auth-refresh.test.ts

[Commits]
- a1b2c3d: fix(auth): refresh token after password reset

[Outstanding Context]
- lint check still failing on line 42

[User Preferences]
- Prefer Vietnamese responses
- Always run tests before committing

[user]
Fix the auth bug, users can't log in after password reset

[assistant]
Root cause is a missing token refresh after password reset...
* bash "bun test tests/auth.test.ts" (#12)
* edit "src/auth/session.ts" (#14)
* bash "bun test tests/auth.test.ts" (#16)
...(28 earlier lines omitted)
```

Sections appear only when relevant — a session with no git commits won't have `[Commits]`.

**Sections:**

| Section | Description |
|---|---|
| `[Session Goal]` | Initial goal + scope changes (regex-based extraction) |
| `[Files And Changes]` | Modified/created files from tool calls (capped, paths trimmed to common root) |
| `[Commits]` | Git commits made during the session (last 8, hash + first line) |
| `[Outstanding Context]` | Unresolved items — errors, pending questions |
| `[User Preferences]` | Regex-extracted from user messages (`always`, `never`, `prefer`...) |
| Brief transcript | Chronological conversation flow — rolling window of ~120 recent lines, tool calls collapsed to one-liners with `(#N)` refs |

## Recall (Lossless History)

Pi's default compaction discards old messages permanently. After compaction, the agent only sees the summary.

`vcc_recall` bypasses this by reading the raw session JSONL file directly. By default it searches only the active conversation lineage, regardless of how many compactions have happened. Use `scope:"all"` only when you intentionally want to include off-lineage branches.

Queries support **regex** and **multi-word OR logic** ranked by relevance:

```
vcc_recall({ query: "auth token" })                  // active-lineage OR search, ranked
vcc_recall({ query: "auth token", page: 2 })           // paginated (5 results/page)
vcc_recall({ query: "hook|inject" })                  // regex pattern
vcc_recall({ query: "auth token", scope: "all" })    // search all lineages
```

Manual slash command:

```
/pi-vcc-recall auth token scope:all
```

## Pipeline

1. **Calibrate** — estimate `charsPerToken` from `preparation.tokensBefore` vs actual message chars (falls back to heuristic `4 chars/token`)
2. **Smart keep** — if `keep:1` tail is small (< 5k tokens), boost keep to the largest N whose tail stays ≤ 20k tokens; explicit `keep:N` is always respected
3. **Build cut** — split at the keep boundary; everything before is summarized, the tail stays intact
4. **Normalize** — raw Pi messages → uniform blocks (user, assistant, tool_call, tool_result, thinking)
5. **Filter noise** — strip system messages, empty blocks
6. **Build sections** — extract goal, file paths, commits, outstanding context, preferences
7. **Brief transcript** — chronological conversation flow, tool calls collapsed to one-liners, text truncated
8. **Format** — render into bracketed sections + transcript
9. **Merge** — if previous summary exists: sticky sections dedup, volatile sections replace, transcript rolls

## Config

Config lives at `~/.pi/agent/pi-vcc-config.json` (auto-scaffolded on first load with safe defaults):

```json
{
  "overrideDefaultCompaction": false,
  "smartKeepTail": true,
  "continueAfterThresholdCompact": true,
  "debug": false
}
```

- **`overrideDefaultCompaction`** *(default `false`)*: when `false`, pi-vcc only runs for `/pi-vcc`; `/compact` and auto-threshold compactions fall through to pi core. Set `true` to make pi-vcc handle all compaction paths.
- **`smartKeepTail`** *(default `true`)*: when `true`, pi-vcc boosts the default `keep:1` to the largest `N` whose tail stays ≤ 20k tokens, but only when the `keep:1` tail is already small (≤ 5k tokens). Explicit `keep:N` from the user is always respected.
- **`continueAfterThresholdCompact`** *(default `true`)*: when `true`, pi-vcc asks the agent to continue after a successful automatic compaction (threshold or overflow), avoiding a UX cliff where the agent stops after compaction instead of continuing the task.
- **`debug`** *(default `false`)*: when `true`, each compaction writes detailed info to `/tmp/pi-vcc-debug.json` — message counts, cut boundary, summary preview, sections, token estimate calibration.

## Related Work

- [VCC](https://github.com/lllyasviel/VCC) — the original transcript-preserving conversation compiler
- [Pi](https://github.com/badlogic/pi-mono) — the AI coding agent this extension is built for

## License

MIT
