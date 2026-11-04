import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BATCH19014_SESSION_FIXTURES,
  runBatch19014StagedFinalizeBenchmark,
} from "./batch190-14-finalize-benchmark.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";
import { buildTabEvaluationEvidenceFromChunkAccums } from "./evaluation-evidence-chunk.ts";
import { evaluateGenericTabEvidence } from "./evaluation-evidence.ts";
import {
  buildRepresentativeUniverse,
  REPRESENTATIVE_UNIVERSE_SIZE,
} from "./sync-screener-cpu-benchmark.ts";
import {
  emptyChunkArtifacts,
  type StagedChunkArtifacts,
} from "./sync-staging-types.ts";
import {
  gainersLosersUniverseQualifiedCount,
  selectGainersLosersFromUniverse,
} from "./selection.ts";

Deno.test("Batch 190.14: fixture clocks match resolveSyncSessionKind", () => {
  for (const fixture of BATCH19014_SESSION_FIXTURES) {
    assertEquals(
      resolveSyncSessionKind(fixture.nowMs),
      fixture.expectedSyncSessionKind,
      `${fixture.session} ${fixture.labelEt} ET`,
    );
  }
});

Deno.test("Batch 190.14: gainers/losers evidence reuses single-pass qualified_count", () => {
  const nowMs = Date.parse("2026-10-28T16:45:00.000Z");
  const universe = buildRepresentativeUniverse(REPRESENTATIVE_UNIVERSE_SIZE, "regular", nowMs);
  const pick = selectGainersLosersFromUniverse(universe, 20, {
    extendedSession: false,
    observationSessionFields: false,
    nowMs,
  });
  const merged: StagedChunkArtifacts = {
    ...emptyChunkArtifacts(),
    primaryAccum: {
      dayTrade: 100,
      volumeSpikes: 50,
      unusual: 40,
      volumeActive: 12_000,
    },
  };
  const evidence = buildTabEvaluationEvidenceFromChunkAccums({
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
  assertEquals(evidence.gainers_losers?.qualified_count, pick.qualifiedCount);
  assertEquals(evidence.gainers_losers?.qualified_count, rescanned.qualified_count);
  assertEquals(evidence.gainers_losers?.selected_count, pick.selected.length);
  assertEquals(
    gainersLosersUniverseQualifiedCount(universe),
    universe.length,
  );
});

Deno.test("Batch 190.14: extended G/L evidence matches precomputed volume_active from chunks", () => {
  const nowMs = Date.parse("2026-10-28T13:35:00.000Z");
  const universe = buildRepresentativeUniverse(500, "pre-market", nowMs);
  const pick = selectGainersLosersFromUniverse(universe, 20, {
    extendedSession: true,
    observationSessionFields: true,
    nowMs,
  });
  const volumeActive = 480;
  const merged: StagedChunkArtifacts = {
    ...emptyChunkArtifacts(),
    primaryAccum: {
      dayTrade: 10,
      volumeSpikes: 10,
      unusual: 10,
      volumeActive,
    },
  };
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
    gainersLosersVolumeActiveCount: volumeActive,
    unusualSelected: [],
    nhlSelected: [],
    extendedSession: true,
    observationSessionFields: true,
    nowMs,
  });
  const rescanned = evaluateGenericTabEvidence(
    "gainers_losers",
    universe,
    pick.selected,
    {
      extendedSession: true,
      observationSessionFields: true,
      nowMs,
    },
  );
  assertEquals(optimized.gainers_losers?.status, rescanned.status);
  assertEquals(
    optimized.gainers_losers?.qualified_count,
    rescanned.qualified_count,
  );
});

for (const session of ["regular", "pre-market", "after-hours"] as const) {
  Deno.test({
    name: `Batch 190.14 finalize benchmark: ${session} 13,262 symbols`,
    fn() {
      const result = runBatch19014StagedFinalizeBenchmark(session);
      console.log(
        `[batch190-14-finalize-benchmark] ${JSON.stringify({
          session: result.session,
          universe_size: result.universe_size,
          before_pr216: result.before_pr216,
          after_pr216: result.after_pr216,
          note: "local_elapsed_not_edge_cpu",
        })}`,
      );
      assertEquals(result.universe_size, 13_262);
      assertEquals(result.before_pr216.build_evidence_ms >= 0, true);
      assertEquals(result.after_pr216.build_evidence_ms >= 0, true);
    },
    sanitizeOps: false,
    sanitizeResources: false,
  });
}
