#!/usr/bin/env node
import { failedGatesOf, offlineCompactors, runOfflineCompactionBenchmark } from "../bench/compaction/offline-runner";
import { syntheticCompactionCases } from "../bench/compaction/synthetic-cases";
import { loadRealSessionCases } from "../bench/compaction/real-sessions";

const args = process.argv.slice(2);

const argValue = (name: string): string | undefined => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  if (index >= 0) return args[index + 1];
  return undefined;
};

const hasFlag = (name: string): boolean => args.includes(name);

const realSessionsDir = argValue("--real-sessions-dir");
const realLimitRaw = argValue("--real-limit");
const realLimit = realLimitRaw ? Number.parseInt(realLimitRaw, 10) : undefined;
const caseFilter = argValue("--case-filter");
const includeDiagnostics = hasFlag("--show-layer-diff");

const selected = argValue("--compactors")
  ?.split(",")
  .map((name) => name.trim())
  .filter(Boolean);

const compactors = selected
  ? offlineCompactors.filter((compactor) => selected.includes(compactor.name))
  : offlineCompactors;

if (selected && compactors.length !== selected.length) {
  const found = new Set(compactors.map((compactor) => compactor.name));
  const missing = selected.filter((name) => !found.has(name));
  console.error(`Unknown compactor(s): ${missing.join(", ")}`);
  console.error(`Available compactors: ${offlineCompactors.map((compactor) => compactor.name).join(", ")}`);
  process.exit(1);
}

const cases = hasFlag("--real-only") ? [] : [...syntheticCompactionCases];
if (realSessionsDir) {
  cases.push(...await loadRealSessionCases({ sessionsDir: realSessionsDir, limit: realLimit }));
}
const filteredCases = caseFilter
  ? cases.filter((testCase) => testCase.id.includes(caseFilter) || testCase.description.includes(caseFilter))
  : cases;

const result = runOfflineCompactionBenchmark({ compactors, cases: filteredCases, includeDiagnostics });
const failures = result.cycles
  .map((cycle) => ({ cycle, gates: failedGatesOf(cycle) }))
  .filter((entry) => entry.gates.length > 0);

if (hasFlag("--jsonl")) {
  for (const cycle of result.cycles) {
    console.log(JSON.stringify(cycle));
  }
} else {
  console.log(JSON.stringify(result, null, 2));
}

if (hasFlag("--assert") && failures.length > 0) {
  console.error(`\nCompaction benchmark assertions failed: ${failures.length} cycle(s)`);
  for (const { cycle, gates } of failures.slice(0, 20)) {
    console.error(JSON.stringify({
      caseId: cycle.caseId,
      compactor: cycle.compactor,
      cycle: cycle.cycle,
      gates,
      missingActiveTerms: cycle.missingActiveTerms,
      missingCurrentTerms: cycle.missingCurrentTerms,
      missingRecallTerms: cycle.missingRecallTerms,
      leakedForbiddenTerms: cycle.leakedForbiddenTerms,
      leakedForbiddenCurrentTerms: cycle.leakedForbiddenCurrentTerms,
      leakedActiveAbsentTerms: cycle.leakedActiveAbsentTerms,
    }));
  }
  if (failures.length > 20) {
    console.error(`... ${failures.length - 20} additional failing cycle(s) omitted`);
  }
  process.exit(1);
}
