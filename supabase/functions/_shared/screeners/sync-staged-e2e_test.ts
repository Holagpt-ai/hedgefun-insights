import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE } from "./baseline-coverage.ts";
import { buildTabEvaluationEvidence } from "./evaluation-evidence.ts";
import { buildTabEvaluationEvidenceFromChunkAccums } from "./evaluation-evidence-chunk.ts";
import {
  assertFrozenBaselineStillValid,
  createFrozenNhlBaselineSnapshot,
} from "./nhl-baseline-snapshot.ts";
import {
  finalizeNhlSelections,
  selectNewHighsLows,
} from "./new-highs-lows.ts";
import {
  finalizeMainUniverseSelections,
  normalizeSymbol,
  selectForTab,
  selectMainUniverseTabs,
  SCREENER_ROW_LIMIT,
  type PolygonTicker,
} from "./selection.ts";
import { buildStagedJobFromUniverse } from "./sync-orchestrator.ts";
import { isExtendedSyncSession, resolveSyncSessionKind } from "./session-sync-context.ts";
import { isLiveSurveillanceSessionKind } from "./screener-session.ts";
import { createSessionVolumeCache, volumeContextFromOpts } from "./session-volume.ts";
import {
  buildRepresentativeNhlBaselines,
  buildRepresentativeUniverse,
  REPRESENTATIVE_UNIVERSE_SIZE,
} from "./sync-screener-cpu-benchmark.ts";
import { foldChunkIntoMerged, processUniverseChunk } from "./sync-chunk-processor.ts";
import { serializeMergedArtifacts } from "./sync-staging-serialize.ts";
import { MemorySyncStagingStore } from "./sync-staging-memory.ts";
import { emptyChunkArtifacts, SCREENER_SYNC_CHUNK_SIZE } from "./sync-staging-types.ts";

function etMs(isoDate: string, hour: number, minute: number): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d, hour + 4, minute, 0, 0);
}

function tickerSymbols(tickers: PolygonTicker[]): string[] {
  return tickers.map((t) => normalizeSymbol(t.ticker)!).sort();
}

type SessionCase = {
  session: "pre-market" | "regular" | "after-hours";
  nowMs: number;
};

const SESSIONS: SessionCase[] = [
  { session: "regular", nowMs: etMs("2026-10-28", 12, 45) },
  { session: "pre-market", nowMs: etMs("2026-10-28", 9, 35) },
  { session: "after-hours", nowMs: etMs("2026-10-28", 16, 20) },
];

for (const { session, nowMs } of SESSIONS) {
  Deno.test(`staged six-tab parity vs monolithic (${session}, ${REPRESENTATIVE_UNIVERSE_SIZE})`, async () => {
    const sessionKind = resolveSyncSessionKind(nowMs);
    const extendedSession = isExtendedSyncSession(sessionKind);
    const observationSessionFields = isLiveSurveillanceSessionKind(sessionKind);
    const cache = createSessionVolumeCache({
      nowMs,
      observationSessionVolume: observationSessionFields,
      extendedSession,
    });
    const opts = {
      extendedSession,
      observationSessionFields,
      nowMs,
      sessionVolumeCache: cache,
    };
    const universe = buildRepresentativeUniverse(
      REPRESENTATIVE_UNIVERSE_SIZE,
      session,
      nowMs,
    );
    const nhlBaselines = buildRepresentativeNhlBaselines(universe, 26);
    const gainersLosersUniverse = universe.slice(0, 800);
    const frozen = createFrozenNhlBaselineSnapshot({
      baselineGenerationId: "gen-test-190",
      status: "available",
      declaredSymbolCount: nhlBaselines.size,
      quotes: nhlBaselines,
      policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
      frozenAtMs: nowMs,
    });

    const tMono0 = performance.now();
    const monolithicMain = selectMainUniverseTabs(universe, opts);
    const monolithicGl = selectForTab(
      "gainers_losers",
      gainersLosersUniverse,
      undefined,
      opts,
    );
    const monolithicNhl = selectNewHighsLows(
      universe,
      nhlBaselines,
      SCREENER_ROW_LIMIT,
      extendedSession,
      nowMs,
      observationSessionFields,
      cache,
    );
    const monoEvidence = buildTabEvaluationEvidence({
      universe,
      dayTradeSelected: monolithicMain.day_trade_radar,
      gapperSelected: monolithicMain.gappers,
      volumeSpikeSelected: monolithicMain.volume_spikes,
      gainersLosersUniverse,
      gainersLosersSelected: monolithicGl,
      unusualSelected: monolithicMain.unusual_volume,
      nhlBaselineStatus: "available",
      nhlBaselines,
      nhlSelected: monolithicNhl,
      nhlPolicyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
      extendedSession,
      observationSessionFields,
      nowMs,
      sessionVolumeCache: cache,
    });
    const monoMs = performance.now() - tMono0;

    const tChunk0 = performance.now();
    const merged = emptyChunkArtifacts();
    const coverage = {
      baselineSymbols: new Set(nhlBaselines.keys()),
      policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
    };
    for (let i = 0; i < universe.length; i += SCREENER_SYNC_CHUNK_SIZE) {
      const slice = universe.slice(i, i + SCREENER_SYNC_CHUNK_SIZE);
      const chunk = processUniverseChunk(slice, {
        ...opts,
        syncSessionKind: sessionKind,
        coverage,
        nhlBaselines,
        policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
      });
      foldChunkIntoMerged(merged, chunk);
    }
    const chunkMs = performance.now() - tChunk0;

    const stagedMain = finalizeMainUniverseSelections(merged.mainQualified, opts);
    const stagedGl = selectForTab(
      "gainers_losers",
      gainersLosersUniverse,
      undefined,
      opts,
    );
    const volumeCtx = volumeContextFromOpts(opts);
    const stagedNhl = finalizeNhlSelections(
      merged.nhlCandidates,
      SCREENER_ROW_LIMIT,
      volumeCtx,
    );
    const stagedEvidence = buildTabEvaluationEvidenceFromChunkAccums({
      universe,
      gappersAccum: merged.gappersAccum,
      primaryAccum: merged.primaryAccum,
      nhlAccum: merged.nhlEvidenceAccum,
      nhlBaselineStatus: "available",
      nhlBaselines,
      dayTradeSelected: stagedMain.day_trade_radar,
      gapperSelected: stagedMain.gappers,
      volumeSpikeSelected: stagedMain.volume_spikes,
      gainersLosersUniverse,
      gainersLosersSelected: stagedGl,
      unusualSelected: stagedMain.unusual_volume,
      nhlSelected: stagedNhl,
      extendedSession,
      observationSessionFields,
      nowMs,
      sessionVolumeCache: cache,
    });

    assertEquals(
      tickerSymbols(stagedMain.day_trade_radar),
      tickerSymbols(monolithicMain.day_trade_radar),
    );
    assertEquals(
      tickerSymbols(stagedMain.gappers),
      tickerSymbols(monolithicMain.gappers),
    );
    assertEquals(
      tickerSymbols(stagedMain.volume_spikes),
      tickerSymbols(monolithicMain.volume_spikes),
    );
    assertEquals(
      tickerSymbols(stagedMain.unusual_volume),
      tickerSymbols(monolithicMain.unusual_volume),
    );
    assertEquals(tickerSymbols(stagedGl), tickerSymbols(monolithicGl));
    assertEquals(
      tickerSymbols(stagedNhl.map((n) => n.ticker)),
      tickerSymbols(monolithicNhl.map((n) => n.ticker)),
    );
    assertEquals(stagedEvidence.gappers?.status, monoEvidence.gappers?.status);
    assertEquals(
      stagedEvidence.new_highs_lows?.qualified_count,
      monoEvidence.new_highs_lows?.qualified_count,
    );

    const tSer0 = performance.now();
    const serialized = JSON.stringify(serializeMergedArtifacts(merged));
    const serMs = performance.now() - tSer0;

    console.log(
      JSON.stringify({
        session,
        mono_ms: Math.round(monoMs),
        chunk_ms: Math.round(chunkMs),
        serialize_ms: Math.round(serMs),
        serialize_bytes: serialized.length,
      }),
    );
  });
}

Deno.test("frozen NHL baseline rejects generation drift", () => {
  const snap = createFrozenNhlBaselineSnapshot({
    baselineGenerationId: "gen-a",
    status: "available",
    declaredSymbolCount: 100,
    quotes: new Map(),
    policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
    frozenAtMs: Date.now(),
  });
  const ok = assertFrozenBaselineStillValid(snap, {
    baselineGenerationId: "gen-a",
    status: "available",
  });
  assertEquals(ok.ok, true);
  const bad = assertFrozenBaselineStillValid(snap, {
    baselineGenerationId: "gen-b",
    status: "available",
  });
  assertEquals(bad.ok, false);
});

Deno.test("duplicate chunk advance is rejected (CAS)", async () => {
  const store = new MemorySyncStagingStore();
  const nowMs = Date.parse("2026-10-28T14:30:00.000Z");
  const universe = buildRepresentativeUniverse(100, "regular", nowMs);
  const acquired = await store.acquireOrCreate(
    buildStagedJobFromUniverse(
      universe,
      [],
      [],
      nowMs,
      new Date(nowMs).toISOString(),
      crypto.randomUUID(),
      40,
    ),
    "lease-1",
    nowMs,
  );
  assertEquals(acquired.ok, true);
  if (!acquired.ok) return;
  const job = acquired.job;
  const merged = emptyChunkArtifacts();
  const first = await store.advanceChunk({
    jobId: job.id,
    leaseToken: "lease-1",
    expectedChunkIndex: 0,
    expectedStateVersion: 0,
    merged,
    nowMs,
  });
  assertEquals(first.ok, true);
  const dup = await store.advanceChunk({
    jobId: job.id,
    leaseToken: "lease-1",
    expectedChunkIndex: 0,
    expectedStateVersion: 0,
    merged,
    nowMs,
  });
  assertEquals(dup.ok, false);
});
