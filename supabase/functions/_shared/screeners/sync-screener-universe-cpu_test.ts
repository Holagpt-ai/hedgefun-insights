/**
 * Local wall-clock regression for the representative sync-screener CPU path.
 * Supabase Edge documents ~2s actual CPU limit — local elapsed time is NOT production CPU.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildRepresentativeUniverse,
  REPRESENTATIVE_UNIVERSE_SIZE,
  runRepresentativeSyncCpuBenchmark,
  type SyncCpuBenchmarkResult,
} from "./sync-screener-cpu-benchmark.ts";
import { buildTabEvaluationEvidenceFromChunkAccums } from "./evaluation-evidence-chunk.ts";
import { evaluateGenericTabEvidence } from "./evaluation-evidence.ts";
import { selectGainersLosersFromUniverse } from "./selection.ts";
import { emptyChunkArtifacts } from "./sync-staging-types.ts";
import {
  createSessionVolumeCache,
  sessionQualificationVolume,
} from "./session-volume.ts";
import type { PolygonTicker } from "./selection.ts";

Deno.test("cpu: session volume cache stores results under bound context", () => {
  const nowMs = Date.parse("2026-10-28T16:45:00.000Z");
  const t: PolygonTicker = {
    ticker: "X",
    updated: nowMs * 1_000_000,
    day: { v: 100_000 },
    min: { av: 100_000, t: nowMs },
  };
  const cache = createSessionVolumeCache({
    nowMs,
    observationSessionVolume: true,
    extendedSession: false,
  });
  const ctx = { observationSessionVolume: true, nowMs, cache };
  assertEquals(sessionQualificationVolume(t, ctx), 100_000);
  assertEquals(cache.qualificationVolume.has(t), true);
});

function logBenchmark(label: string, result: SyncCpuBenchmarkResult) {
  console.log(
    `[sync-screener-cpu-benchmark] ${label} ${JSON.stringify({
      session: result.session,
      universe_size: result.universe_size,
      optimized_ms: result.optimized,
      legacy_multi_pass_ms: result.legacy_multi_pass,
      row_count: result.row_count,
      rpc_payload_bytes: result.rpc_payload_bytes,
      note: "local_elapsed_not_edge_cpu",
    })}`,
  );
}

Deno.test("cpu: Batch 190.14 precomputed G/L evidence matches full rescan semantics", () => {
  const nowMs = Date.parse("2026-10-28T16:45:00.000Z");
  const universe = buildRepresentativeUniverse(REPRESENTATIVE_UNIVERSE_SIZE, "regular", nowMs);
  const pick = selectGainersLosersFromUniverse(universe, 20, {
    extendedSession: false,
    observationSessionFields: false,
    nowMs,
  });
  const merged = emptyChunkArtifacts();
  const optimized = buildTabEvaluationEvidenceFromChunkAccums({
    universe,
    gappersAccum: merged.gappersAccum,
    primaryAccum: merged.primaryAccum,
    nhlAccum: merged.nhlEvidenceAccum,
    nhlBaselineStatus: "available",
    nhlBaselines: new Map(),
    dayTradeSelected: [],
    gapperSelected: [],
    volumeSpikeSelected: [],
    gainersLosersUniverse: universe,
    gainersLosersSelected: pick.selected,
    gainersLosersQualifiedCount: pick.qualifiedCount,
    unusualSelected: [],
    nhlSelected: [],
    nowMs,
  });
  const rescanned = evaluateGenericTabEvidence(
    "gainers_losers",
    universe,
    pick.selected,
    { nowMs },
  );
  assertEquals(
    optimized.gainers_losers?.qualified_count,
    rescanned.qualified_count,
  );
  assertEquals(optimized.gainers_losers?.status, rescanned.status);
});

for (const session of ["regular", "pre-market", "after-hours"] as const) {
  Deno.test({
    name: `cpu benchmark: ${session} session 13,262-symbol staged path`,
    fn() {
      const result = runRepresentativeSyncCpuBenchmark(session);
      logBenchmark(session, result);
      assertEquals(result.universe_size, 13_262);
      assertEquals(result.row_count > 0, true);
      assertEquals(result.rpc_payload_bytes > 0, true);
    },
    sanitizeOps: false,
    sanitizeResources: false,
  });
}
