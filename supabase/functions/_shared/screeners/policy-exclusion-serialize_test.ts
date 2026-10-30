import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validatePolicyExclusionEvidence } from "./baseline-coverage.ts";
import {
  deserializePolicyExclusionEvidence,
  serializePolicyExclusionEvidence,
} from "./policy-exclusion-serialize.ts";
import { createFrozenNhlBaselineSnapshot } from "./nhl-baseline-snapshot.ts";
import {
  jobInsertRowJsonRoundTrip,
  jobToInsertRow,
} from "./sync-staging-serialize.ts";
import { buildStagedJobFromUniverse } from "./sync-orchestrator.ts";
import { buildRepresentativeUniverse } from "./sync-screener-cpu-benchmark.ts";

Deno.test("policy exclusion JSON round-trip preserves Set semantics", () => {
  const evidence = validatePolicyExclusionEvidence({
    generationId: "gen-excl-1",
    policyMinSessions: 20,
    policyExcludedCount: 3,
    rows: [
      {
        generation_id: "gen-excl-1",
        symbol: "AAA",
        reason: "insufficient_sessions",
        sessions_observed: 5,
        min_sessions: 20,
      },
      {
        generation_id: "gen-excl-1",
        symbol: "BBB",
        reason: "insufficient_sessions",
        sessions_observed: 10,
        min_sessions: 20,
      },
      {
        generation_id: "gen-excl-1",
        symbol: "CCC",
        reason: "insufficient_sessions",
        sessions_observed: 1,
        min_sessions: 20,
      },
    ],
  });
  const wire = JSON.parse(
    JSON.stringify(serializePolicyExclusionEvidence(evidence)),
  );
  const restored = deserializePolicyExclusionEvidence(wire);
  assertEquals(restored.available, true);
  assertEquals(restored.excluded_count, 3);
  assertEquals(restored.symbols.has("AAA"), true);
  assertEquals(restored.symbols.has("BBB"), true);
  assertEquals(restored.symbols.has("CCC"), true);
  assertEquals(restored.symbols.size, 3);
});

Deno.test("jobToInsertRow JSON round-trip preserves NHL snapshot exclusions", () => {
  const nowMs = Date.parse("2026-10-28T14:30:00.000Z");
  const universe = buildRepresentativeUniverse(50, "regular", nowMs);
  const evidence = validatePolicyExclusionEvidence({
    generationId: "gen-excl-2",
    policyMinSessions: 15,
    policyExcludedCount: 1,
    rows: [{
      generation_id: "gen-excl-2",
      symbol: "ZZZ",
      reason: "insufficient_sessions",
      sessions_observed: 2,
      min_sessions: 15,
    }],
  });
  const snap = createFrozenNhlBaselineSnapshot({
    baselineGenerationId: "gen-excl-2",
    status: "available",
    declaredSymbolCount: 10,
    quotes: new Map([["AAA", {
      symbol: "AAA",
      high_52w: 100,
      low_52w: 1,
      sessions_observed: 200,
    }]]),
    policyExclusions: evidence,
    frozenAtMs: nowMs,
  });
  const base = buildStagedJobFromUniverse(
    universe,
    [],
    [],
    nowMs,
    new Date(nowMs).toISOString(),
    crypto.randomUUID(),
  );
  const job = {
    ...base,
    id: crypto.randomUUID(),
    leaseToken: null,
    leaseExpiresMs: null,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    stateVersion: 0,
    continueLastAtMs: null,
    continueLastError: null,
    finalizeLeaseToken: null,
    finalizeLeaseExpiresMs: null,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
    nhlBaselineSnapshot: snap,
  };
  const row = jobToInsertRow(job);
  const parsed = JSON.parse(JSON.stringify(row));
  const roundTripped = jobInsertRowJsonRoundTrip(job);
  assertEquals(roundTripped.nhlBaselineSnapshot?.policyExclusions.available, true);
  assertEquals(
    roundTripped.nhlBaselineSnapshot?.policyExclusions.symbols.has("ZZZ"),
    true,
  );
  assertEquals(parsed.nhl_baseline_snapshot?.policyExclusions?.symbols?.length, 1);
});
