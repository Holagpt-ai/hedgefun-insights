/**
 * ISS-034 Option B — R1–R7 regression matrix (implementation).
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateGappersEvidence } from "./evaluation-evidence.ts";
import {
  classifyGappersGapInput,
  replayGappersGapInputAccounting,
} from "./gappers-gap-input-accounting.ts";
import { buildPriorGenerationRetentionAbortDetail } from "./generation-abort-diagnostics.ts";
import { shouldPreservePriorScreenerGeneration } from "./generation-preserve.ts";
import {
  canAllowDegradedGappersPublication,
  countRowsByTab,
  isDegradedGappersPublishEnabled,
  omitGappersRowsForDegradedPublication,
  preservationCompanionTabsEvaluatedOnCandidate,
  publishedTabCountsFromRows,
} from "./screener-degraded-gappers-publish.ts";
import { buildStagedJobFromUniverse } from "./sync-orchestrator.ts";
import { buildRepresentativeUniverse } from "./sync-screener-cpu-benchmark.ts";
import { MemorySyncStagingStore } from "./sync-staging-memory.ts";
import type { PolygonTicker } from "./selection.ts";
import { isStructurallyNoPriorSession, type HistoricalCoverageEvidence } from "./evaluation-evidence.ts";

const MORNING = "2026-11-16T14:25:00.000Z";
const AFTERNOON = Date.parse("2026-11-16T22:05:00.000Z");

const priorFull = {
  gappers: {
    status: "evaluated" as const,
    universe_count: 100,
    volume_positive_count: 50,
    gap_calculable_count: 50,
    qualified_count: 5,
    selected_count: 5,
  },
  gainers_losers: {
    status: "evaluated" as const,
    universe_count: 100,
    qualified_count: 10,
    selected_count: 10,
  },
  new_highs_lows: {
    status: "evaluated" as const,
    baseline_status: "available" as const,
    baseline_quote_count: 1000,
    universe_count: 100,
    selected_count: 5,
  },
};

const candidateGappersIncomplete = {
  ...priorFull,
  gappers: {
    ...priorFull.gappers,
    status: "prerequisite_unavailable" as const,
    gap_calculable_count: 1298,
    unresolved_gap_input_count: 2,
    qualified_count: 0,
    selected_count: 0,
    reason: "gap_input_coverage_incomplete",
  },
};

Deno.test("R1: flag disabled preserves generation on gappers-only degrade", () => {
  assertEquals(isDegradedGappersPublishEnabled(() => undefined), false);
  assertEquals(isDegradedGappersPublishEnabled(() => "false"), false);
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: priorFull,
      nextEvidence: candidateGappersIncomplete,
      nowMs: AFTERNOON,
      priorSyncedAt: MORNING,
      allowDegradedGappersPublish: false,
    }),
    true,
  );
});

Deno.test("R2: flag enabled skips preserve; rows omit gappers only", () => {
  assertEquals(isDegradedGappersPublishEnabled(() => "true"), true);
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: priorFull,
      nextEvidence: candidateGappersIncomplete,
      nowMs: AFTERNOON,
      priorSyncedAt: MORNING,
      allowDegradedGappersPublish: true,
    }),
    false,
  );
  const rows = [
    { tab_id: "gappers", symbol: "GAP1" },
    { tab_id: "gappers", symbol: "GAP2" },
    { tab_id: "gainers_losers", symbol: "GL1" },
    { tab_id: "new_highs_lows", symbol: "NHL1" },
    { tab_id: "day_trade_radar", symbol: "DTR1" },
  ];
  const filtered = omitGappersRowsForDegradedPublication(
    rows,
    candidateGappersIncomplete,
    true,
  );
  assertEquals(countRowsByTab(filtered).gappers ?? 0, 0);
  assertEquals(countRowsByTab(filtered).gainers_losers, 1);
  assertEquals(countRowsByTab(filtered).new_highs_lows, 1);
  assertEquals(filtered.length, 3);
});

Deno.test("R2: strict eligibility rejects companion tabs not evaluated on candidate", () => {
  assertEquals(
    preservationCompanionTabsEvaluatedOnCandidate(candidateGappersIncomplete),
    true,
  );
  const nhlNotEvaluated = {
    ...candidateGappersIncomplete,
    new_highs_lows: {
      ...priorFull.new_highs_lows,
      status: "not_evaluated" as const,
      reason: "baseline_coverage_incomplete",
    },
  };
  assertEquals(
    preservationCompanionTabsEvaluatedOnCandidate(nhlNotEvaluated),
    false,
  );
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: priorFull,
      nextEvidence: nhlNotEvaluated,
      nowMs: AFTERNOON,
      priorSyncedAt: MORNING,
      allowDegradedGappersPublish: true,
    }),
    true,
  );
  assertEquals(
    canAllowDegradedGappersPublication({
      degradedTabs: ["gappers"],
      nextEvidence: nhlNotEvaluated,
      allowDegradedGappersPublish: true,
    }),
    false,
  );
});

Deno.test("R2: response tab counts match published payload (zero gappers)", () => {
  const rows = [
    { tab_id: "day_trade_radar", symbol: "A" },
    { tab_id: "gappers", symbol: "G" },
    { tab_id: "gainers_losers", symbol: "B" },
  ];
  const publishRows = omitGappersRowsForDegradedPublication(
    rows,
    candidateGappersIncomplete,
    true,
  );
  const tabs = publishedTabCountsFromRows(publishRows);
  assertEquals(tabs.gappers, 0);
  assertEquals(tabs.day_trade_radar, 1);
  assertEquals(tabs.gainers_losers, 1);
  assertEquals(publishRows.length, 2);
});

Deno.test("R2: flag on still preserves when gainers_losers degrades", () => {
  const next = {
    ...candidateGappersIncomplete,
    gainers_losers: {
      status: "prerequisite_unavailable" as const,
      universe_count: 100,
      qualified_count: 0,
      selected_count: 0,
    },
  };
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: priorFull,
      nextEvidence: next,
      nowMs: AFTERNOON,
      priorSyncedAt: MORNING,
      allowDegradedGappersPublish: true,
    }),
    true,
  );
});

function asbpw(): PolygonTicker {
  const Z = { o: 0, h: 0, l: 0, c: 0, v: 0 };
  return {
    ticker: "ASBPW",
    day: { o: 0.0121, c: 0.011, v: 800_000 },
    prevDay: { ...Z },
  };
}

function aspcr(): PolygonTicker {
  const Z = { o: 0, h: 0, l: 0, c: 0, v: 0 };
  return {
    ticker: "ASPCR",
    day: { o: 0.0551, c: 0.054, v: 600_000 },
    prevDay: { ...Z },
  };
}

const nov16Coverage: HistoricalCoverageEvidence = {
  baselineSymbols: new Set(["ASBPW"]),
  policyExclusions: {
    available: true,
    min_sessions: 120,
    excluded_count: 1,
    symbols: new Set(["ASPCR"]),
  },
};

Deno.test("R3: ASBPW and ASPCR missing_prior_close", () => {
  for (const t of [asbpw(), aspcr()]) {
    const cls = classifyGappersGapInput(
      t,
      { extendedSession: false, nowMs: AFTERNOON },
      {
        extendedSession: false,
        nowMs: AFTERNOON,
        isStructurallyNoPriorSession: (tick) =>
          isStructurallyNoPriorSession(tick, nov16Coverage, false, AFTERNOON),
      },
    );
    assertEquals(cls.bucket, "unresolved");
    assertEquals(cls.rejectReason, "missing_prior_close");
  }
});

Deno.test("R4: gappers recovery publishes evaluated evidence", () => {
  const universe = [
    {
      ticker: "OK",
      day: { o: 10, c: 10.2, v: 1_000_000 },
      prevDay: { c: 10, v: 1 },
    },
    asbpw(),
  ];
  const healed = evaluateGappersEvidence(
    [universe[0]],
    [],
    nov16Coverage,
    false,
    AFTERNOON,
  );
  assertEquals(healed.status, "evaluated");
  assertEquals(healed.unresolved_gap_input_count, 0);
  const stillBroken = replayGappersGapInputAccounting(
    universe,
    {
      extendedSession: false,
      nowMs: AFTERNOON,
      isStructurallyNoPriorSession: (t) =>
        isStructurallyNoPriorSession(t, nov16Coverage, false, AFTERNOON),
    },
  );
  assertEquals(stillBroken.unresolved_gap_input_count, 1);
});

Deno.test("R5: abort diagnostics retain candidate_gappers on retain path", () => {
  const detail = buildPriorGenerationRetentionAbortDetail({
    priorEvidence: priorFull,
    nextEvidence: candidateGappersIncomplete,
    priorSyncedAt: MORNING,
    candidateGenerationId: "job",
    candidateSyncRunId: "run",
    candidateGappersAccum: {
      volume_positive_count: 1302,
      gap_calculable_count: 1298,
      no_prior_session_count: 1,
      split_scale_suppressed_count: 1,
      unresolved_gap_input_count: 2,
      unresolvedGapSymbols: ["ASBPW", "ASPCR"],
      qualified_count: 0,
    },
  });
  const evidence = detail.evidence as {
    candidate_gappers?: { unresolved_gap_input_count: number };
  };
  assertEquals(evidence.candidate_gappers?.unresolved_gap_input_count, 2);
});

Deno.test("R7: row filter idempotent and preserves non-gapper symbols", () => {
  const rows = [
    { tab_id: "volume_spikes", symbol: "VS1" },
    { tab_id: "unusual_volume", symbol: "UV1" },
    { tab_id: "gappers", symbol: "G1" },
  ];
  const once = omitGappersRowsForDegradedPublication(
    rows,
    candidateGappersIncomplete,
    true,
  );
  const twice = omitGappersRowsForDegradedPublication(
    once,
    candidateGappersIncomplete,
    true,
  );
  assertEquals(once, twice);
  assertEquals(once.length, 2);
});

Deno.test("R5/R7: staged publish rowsInserted matches filtered payload (single replace)", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse(MORNING);
  const syncRunId = crypto.randomUUID();
  const universe = buildRepresentativeUniverse(10, "regular", nowMs);
  const base = buildStagedJobFromUniverse(
    universe,
    [],
    [],
    nowMs,
    new Date(nowMs).toISOString(),
    syncRunId,
    10,
  );
  const jobId = crypto.randomUUID();
  store.seedJob({
    ...base,
    id: jobId,
    status: "finalizing",
    nextChunkIndex: base.totalChunks,
    leaseToken: null,
    leaseExpiresMs: null,
    createdAtMs: nowMs,
    updatedAtMs: nowMs,
    stateVersion: 0,
    continueLastAtMs: null,
    continueLastError: null,
    finalizeLeaseToken: "fin-opt-b",
    finalizeLeaseExpiresMs: nowMs + 60_000,
    publishRowsInserted: null,
    publishRpcRecordedAtMs: null,
    abortReason: null,
    abortEvidence: null,
  });
  const candidateRows = [
    { tab_id: "gappers", symbol: "G1" },
    { tab_id: "gainers_losers", symbol: "GL1" },
    { tab_id: "day_trade_radar", symbol: "D1" },
  ];
  const publishRows = omitGappersRowsForDegradedPublication(
    candidateRows,
    candidateGappersIncomplete,
    true,
  );
  assertEquals(publishedTabCountsFromRows(publishRows).gappers, 0);
  const first = await store.publishStagedGeneration({
    jobId,
    finalizeLeaseToken: "fin-opt-b",
    expectedStateVersion: 0,
    syncRunId,
    syncedAt: new Date(nowMs).toISOString(),
    nhlBaselineStatus: "available",
    tabEvaluationEvidence: candidateGappersIncomplete,
    rows: publishRows,
    nowMs,
  });
  assertEquals(first.ok, true);
  if (!first.ok) return;
  assertEquals(first.rowsInserted, publishRows.length);
  const replay = await store.publishStagedGeneration({
    jobId,
    finalizeLeaseToken: "fin-opt-b",
    expectedStateVersion: 0,
    syncRunId,
    syncedAt: new Date(nowMs).toISOString(),
    nhlBaselineStatus: "available",
    tabEvaluationEvidence: candidateGappersIncomplete,
    rows: publishRows,
    nowMs,
  });
  assertEquals(replay.ok, true);
  if (!replay.ok) return;
  assertEquals(replay.rowsInserted, publishRows.length);
});