/**
 * ISS-034 full-job replay input validation and frozen-baseline coverage.
 */

import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  historicalCoverageFromFrozenSnapshot,
  Iss034ReplayInputError,
  parseIss034JobExport,
  replayIss034JobExport,
} from "./iss034-job-gappers-replay.ts";
import { isStructurallyNoPriorSession } from "./evaluation-evidence.ts";
import { classifyGappersGapInput } from "./gappers-gap-input-accounting.ts";
import {
  createFrozenNhlBaselineSnapshot,
  serializeNhlBaselineSnapshotForStorage,
} from "./nhl-baseline-snapshot.ts";
import { serializeMergedArtifacts } from "./sync-staging-serialize.ts";
import { emptyChunkArtifacts } from "./sync-staging-types.ts";
import type { GappersEvidenceAccum } from "./evaluation-evidence-chunk.ts";
import type { PolygonTicker } from "./selection.ts";
import type { NhlBaselineQuote } from "./new-highs-lows.ts";

const RTH_NOW = Date.parse("2026-11-16T22:05:00.000Z");
const JOB_ID = "4ed4a4c7-d8c4-4582-bd89-cc949d6e291d";

const ZERO_PREV = { o: 0, h: 0, l: 0, c: 0, v: 0 };

function asbpw(): PolygonTicker {
  return {
    ticker: "ASBPW",
    day: { o: 0.0121, c: 0.011, h: 0.013, l: 0.01, v: 850_000 },
    prevDay: { ...ZERO_PREV },
  };
}

function aspcr(): PolygonTicker {
  return {
    ticker: "ASPCR",
    day: { o: 0.0551, c: 0.054, h: 0.056, l: 0.05, v: 620_000 },
    prevDay: { ...ZERO_PREV },
  };
}

function nov16FrozenSnapshot() {
  const quotes = new Map<string, NhlBaselineQuote>([
    ["ASBPW", { symbol: "ASBPW", high_52w: 0.02, low_52w: 0.008, sessions_observed: 200 }],
  ]);
  return createFrozenNhlBaselineSnapshot({
    baselineGenerationId: "nov16-baseline-gen",
    status: "available",
    declaredSymbolCount: 1,
    quotes,
    policyExclusions: {
      available: true,
      min_sessions: 120,
      excluded_count: 1,
      symbols: new Set(["ASPCR"]),
    },
    frozenAtMs: RTH_NOW - 60_000,
  });
}

function exportShell(input: {
  allTickers: PolygonTicker[];
  gappersAccum?: Partial<GappersEvidenceAccum>;
  snapshot?: ReturnType<typeof nov16FrozenSnapshot> | null;
  observation?: Record<string, unknown>;
}) {
  const artifacts = emptyChunkArtifacts();
  artifacts.gappersAccum = {
    ...artifacts.gappersAccum,
    ...input.gappersAccum,
  };
  const merged = serializeMergedArtifacts(artifacts);
  const obs = {
    nowMs: RTH_NOW,
    extendedSession: false,
    observationSessionFields: false,
    ...input.observation,
  };
  return {
    id: JOB_ID,
    sync_run_id: "3be0f3e6-9aab-4e51-8e2c-8d2c2fd5f414",
    observation: obs,
    all_tickers: input.allTickers,
    merged_artifacts: merged,
    nhl_baseline_snapshot: input.snapshot === null
      ? undefined
      : serializeNhlBaselineSnapshotForStorage(
        input.snapshot ?? nov16FrozenSnapshot(),
      ),
  };
}

Deno.test("job replay: rejects missing nhl_baseline_snapshot", () => {
  assertThrows(
    () => parseIss034JobExport(exportShell({ allTickers: [asbpw()], snapshot: null })),
    Iss034ReplayInputError,
    "nhl_baseline_snapshot",
  );
});

Deno.test("job replay: rejects missing observation.nowMs (no clock fallback)", () => {
  assertThrows(
    () =>
      parseIss034JobExport(
        exportShell({
          allTickers: [asbpw()],
          observation: { nowMs: undefined },
        }),
      ),
    Iss034ReplayInputError,
    "nowMs",
  );
});

Deno.test("job replay: structural no-prior uses frozen baseline + exclusions", () => {
  const snap = createFrozenNhlBaselineSnapshot({
    baselineGenerationId: "struct-test",
    status: "available",
    declaredSymbolCount: 0,
    quotes: new Map(),
    policyExclusions: {
      available: true,
      min_sessions: 120,
      excluded_count: 0,
      symbols: new Set(),
    },
    frozenAtMs: RTH_NOW,
  });
  const coverage = historicalCoverageFromFrozenSnapshot(snap);
  const structNoPrior: PolygonTicker = {
    ticker: "BRANDNEW",
    day: { o: 2.5, c: 2.6, h: 2.7, l: 2.4, v: 500_000 },
    prevDay: { ...ZERO_PREV },
  };
  assertEquals(
    isStructurallyNoPriorSession(structNoPrior, coverage, false, RTH_NOW),
    true,
  );
  const listed: PolygonTicker = {
    ticker: "LISTED",
    day: { o: 10, c: 10.1, v: 1_000_000 },
    prevDay: { c: 10, v: 1 },
  };
  assertEquals(
    isStructurallyNoPriorSession(listed, coverage, false, RTH_NOW),
    false,
  );
});

Deno.test("job replay: ASBPW/ASPCR missing_prior_close with frozen snapshot export", () => {
  const raw = exportShell({
    allTickers: [asbpw(), aspcr()],
    gappersAccum: {
      volume_positive_count: 2,
      gap_calculable_count: 0,
      no_prior_session_count: 0,
      split_scale_suppressed_count: 0,
      unresolved_gap_input_count: 2,
      unresolvedGapSymbols: ["ASBPW", "ASPCR"],
    },
  });
  const parsed = parseIss034JobExport(raw);
  const coverage = historicalCoverageFromFrozenSnapshot(parsed.nhlBaselineSnapshot);
  for (const t of [asbpw(), aspcr()]) {
    const cls = classifyGappersGapInput(
      t,
      { extendedSession: false, nowMs: RTH_NOW },
      {
        extendedSession: false,
        observationSessionFields: false,
        nowMs: RTH_NOW,
        isStructurallyNoPriorSession: (tick) =>
          isStructurallyNoPriorSession(tick, coverage, false, RTH_NOW),
      },
    );
    assertEquals(cls.bucket, "unresolved");
    assertEquals(cls.rejectReason, "missing_prior_close");
  }
  const out = replayIss034JobExport(raw);
  assertEquals(out.replay.unresolved_gap_input_count, 2);
  assertEquals(out.replay.unresolved.map((r) => r.symbol).sort(), ["ASBPW", "ASPCR"]);
  assertEquals(out.is_target_job, true);
  assertEquals(out.counter_reconciliation.mismatches.length, 0);
});