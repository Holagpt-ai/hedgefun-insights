import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
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
import { selectGainersLosersFromUniverse } from "./selection.ts";
import { deferEdgeWork } from "../edge/defer-work.ts";

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
});

Deno.test("Batch 190.14: deferEdgeWork returns before async work completes", async () => {
  let done = false;
  deferEdgeWork(async () => {
    await new Promise((r) => setTimeout(r, 25));
    done = true;
  });
  assertEquals(done, false);
  await new Promise((r) => setTimeout(r, 40));
  assertEquals(done, true);
});
