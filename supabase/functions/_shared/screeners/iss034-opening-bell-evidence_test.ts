/**
 * ISS-034 — November 13, 2026 09:30 ET session-transition evidence.
 *
 * Production: 09:25 published; 09:30 completed 7/7, last durable marker
 * `finalize_stage:build_evidence`, abort `prior_generation_retained`,
 * Gappers `prerequisite_unavailable`, NHL `not_evaluated`; 09:50/10:05 published.
 *
 * Regular-session Gappers require day.o; NHL requires day.c plus day.h/l.
 * Opening-bell snapshots that have day.v before those fields must fail closed.
 * Same-date 09:25 evidence is "current", so preservation retains it. Do not
 * weaken that safeguard or invent opens / day ranges.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE } from "./baseline-coverage.ts";
import {
  evaluateGappersEvidence,
  evaluateNhlEvidence,
  type TabEvaluationEvidenceMap,
} from "./evaluation-evidence.ts";
import { shouldPreservePriorScreenerGeneration } from "./generation-preserve.ts";
import {
  NHL_VERIFIED_MIN_SESSIONS,
  type NhlBaselineQuote,
} from "./new-highs-lows.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";
import type { PolygonTicker } from "./selection.ts";
import { shouldPersistFinalizeStageMarker } from "./sync-finalize-diagnostics.ts";

/** Friday Nov 13, 2026 is EST (UTC-5). */
const ET_0925 = Date.parse("2026-11-13T14:25:00.000Z");
const ET_0930 = Date.parse("2026-11-13T14:30:00.000Z");
const ET_0950 = Date.parse("2026-11-13T14:50:00.000Z");

function ns(ms: number): number {
  return ms * 1_000_000;
}

function baseline(symbol: string): NhlBaselineQuote {
  return {
    symbol,
    high_52w: 20,
    low_52w: 5,
    sessions_observed: NHL_VERIFIED_MIN_SESSIONS,
  };
}

const NHL_BASELINES = new Map([["OPEN", baseline("OPEN")]]);

/** 09:25 premarket snapshot: extended last + leftover day range, no day.o. */
function premarket0925(): PolygonTicker {
  return {
    ticker: "OPEN",
    updated: ns(ET_0925),
    day: { v: 0, c: 10.2, h: 12, l: 8 },
    prevDay: { c: 10, v: 1_000_000 },
    min: { av: 800_000, v: 1_000, c: 10.4, t: ET_0925 },
    lastTrade: { p: 10.5, t: ET_0925 },
  };
}

/**
 * 09:30 first RTH snapshot: market observation, day.v started, opening
 * print and day range not yet populated.
 */
function openBell0930(): PolygonTicker {
  return {
    ticker: "OPEN",
    updated: ns(ET_0930),
    day: { v: 50_000, c: 10.6 },
    prevDay: { c: 10, v: 1_000_000 },
    min: { av: 850_000, v: 2_000, c: 10.6, t: ET_0930 },
    lastTrade: { p: 10.6, t: ET_0930 },
  };
}

/** 09:50 RTH snapshot: opening print and day range present. */
function rth0950(): PolygonTicker {
  return {
    ticker: "OPEN",
    updated: ns(ET_0950),
    day: { o: 10.4, c: 10.8, h: 11.0, l: 10.3, v: 2_000_000 },
    prevDay: { c: 10, v: 1_000_000 },
    min: { av: 2_100_000, v: 3_000, c: 10.8, t: ET_0950 },
    lastTrade: { p: 10.8, t: ET_0950 },
  };
}

function gappersAt(
  t: PolygonTicker,
  nowMs: number,
  extendedSession: boolean,
) {
  return evaluateGappersEvidence(
    [t],
    [],
    undefined,
    extendedSession,
    nowMs,
    true,
  );
}

function nhlAt(
  t: PolygonTicker,
  nowMs: number,
  extendedSession: boolean,
) {
  return evaluateNhlEvidence(
    [t],
    NHL_BASELINES,
    "available",
    [],
    POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
    extendedSession,
    nowMs,
    true,
  );
}

function gappersMap(
  status: "evaluated" | "prerequisite_unavailable",
): TabEvaluationEvidenceMap {
  return {
    gappers: {
      status,
      universe_count: 1,
      volume_positive_count: 1,
      gap_calculable_count: status === "evaluated" ? 1 : 0,
      no_prior_session_count: 0,
      split_scale_suppressed_count: 0,
      unresolved_gap_input_count: status === "evaluated" ? 0 : 1,
      qualified_count: 0,
      selected_count: 0,
      ...(status === "prerequisite_unavailable"
        ? { reason: "gap_input_coverage_incomplete" }
        : {}),
    },
  };
}

function nhlMap(
  status: "evaluated" | "not_evaluated",
): TabEvaluationEvidenceMap {
  return {
    new_highs_lows: {
      status,
      baseline_status: "available",
      baseline_quote_count: 1,
      universe_count: 1,
      eligible_count: 1,
      evaluated_count: status === "evaluated" ? 1 : 0,
      policy_excluded_count: 0,
      no_history_count: 0,
      unresolved_count: status === "evaluated" ? 0 : 1,
      qualified_count: 0,
      selected_count: 0,
      ...(status === "not_evaluated"
        ? { reason: "baseline_coverage_incomplete" }
        : {}),
    },
  };
}

Deno.test("ISS-034: 09:25 / 09:30 / 09:50 ET session kinds", () => {
  assertEquals(resolveSyncSessionKind(ET_0925), "pre-market");
  assertEquals(resolveSyncSessionKind(ET_0930), "market");
  assertEquals(resolveSyncSessionKind(ET_0950), "market");
});

Deno.test("ISS-034: preserve_check is not a durable finalize marker", () => {
  assertEquals(shouldPersistFinalizeStageMarker("build_evidence"), true);
  assertEquals(shouldPersistFinalizeStageMarker("preserve_check"), false);
});

Deno.test("ISS-034: 09:25 premarket Gappers and NHL evaluate", () => {
  const t = premarket0925();
  const gappers = gappersAt(t, ET_0925, true);
  const nhl = nhlAt(t, ET_0925, true);
  assertEquals(gappers.status, "evaluated");
  assertEquals(gappers.unresolved_gap_input_count, 0);
  assertEquals(nhl.status, "evaluated");
  assertEquals(nhl.unresolved_count, 0);
});

Deno.test("ISS-034: 09:30 market snapshot without day.o / day range fails closed", () => {
  const t = openBell0930();
  const gappers = gappersAt(t, ET_0930, false);
  const nhl = nhlAt(t, ET_0930, false);
  assertEquals(gappers.status, "prerequisite_unavailable");
  assertEquals(gappers.reason, "prior_close_gap_inputs_unavailable");
  assertEquals(gappers.volume_positive_count, 1);
  assertEquals(gappers.gap_calculable_count, 0);
  assertEquals(gappers.unresolved_gap_input_count, 1);
  assertEquals(nhl.status, "not_evaluated");
  assertEquals(nhl.reason, "baseline_coverage_incomplete");
  assertEquals(nhl.eligible_count, 1);
  assertEquals(nhl.unresolved_count, 1);
});

Deno.test("ISS-034: 09:30 mixed day.o coverage is still prerequisite_unavailable", () => {
  const missingOpen = openBell0930();
  const hasOpen: PolygonTicker = {
    ...rth0950(),
    ticker: "HASO",
    updated: ns(ET_0930),
    min: { av: 2_100_000, v: 3_000, c: 10.8, t: ET_0930 },
    lastTrade: { p: 10.8, t: ET_0930 },
  };
  const gappers = evaluateGappersEvidence(
    [missingOpen, hasOpen],
    [],
    undefined,
    false,
    ET_0930,
    true,
  );
  assertEquals(gappers.status, "prerequisite_unavailable");
  assertEquals(gappers.reason, "gap_input_coverage_incomplete");
  assertEquals(gappers.gap_calculable_count, 1);
  assertEquals(gappers.unresolved_gap_input_count, 1);
});

Deno.test("ISS-034: 09:50 RTH snapshot with day.o and day range evaluates", () => {
  const t = rth0950();
  const gappers = gappersAt(t, ET_0950, false);
  const nhl = nhlAt(t, ET_0950, false);
  assertEquals(gappers.status, "evaluated");
  assertEquals(gappers.unresolved_gap_input_count, 0);
  assertEquals(nhl.status, "evaluated");
  assertEquals(nhl.unresolved_count, 0);
});

Deno.test("ISS-034: 09:30 retains same-date 09:25 evidence; 09:50 does not", () => {
  const prior0925: TabEvaluationEvidenceMap = {
    ...gappersMap("evaluated"),
    ...nhlMap("evaluated"),
  };
  const next0930: TabEvaluationEvidenceMap = {
    ...gappersMap("prerequisite_unavailable"),
    ...nhlMap("not_evaluated"),
  };
  const next0950: TabEvaluationEvidenceMap = {
    ...gappersMap("evaluated"),
    ...nhlMap("evaluated"),
  };
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: prior0925,
      nextEvidence: next0930,
      nowMs: ET_0930,
      priorSyncedAt: "2026-11-13T14:25:00.000Z",
    }),
    true,
  );
  assertEquals(
    shouldPreservePriorScreenerGeneration({
      priorEvidence: prior0925,
      nextEvidence: next0950,
      nowMs: ET_0950,
      priorSyncedAt: "2026-11-13T14:25:00.000Z",
    }),
    false,
  );
});
