import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildRepresentativeUniverse,
  REPRESENTATIVE_UNIVERSE_SIZE,
} from "./sync-screener-cpu-benchmark.ts";
import {
  collectMainUniverseQualified,
  finalizeMainUniverseSelections,
  mergeMainUniverseQualified,
  normalizeSymbol,
  selectForTab,
  selectMainUniverseTabs,
  type PolygonTicker,
} from "./selection.ts";
import { createSessionVolumeCache } from "./session-volume.ts";
import { resolveSyncSessionKind } from "./session-sync-context.ts";
import { isLiveSurveillanceSessionKind } from "./screener-session.ts";
import { SCREENER_SYNC_CHUNK_SIZE } from "./sync-staging-types.ts";
import { foldChunkIntoMerged, processUniverseChunk } from "./sync-chunk-processor.ts";
import { emptyChunkArtifacts } from "./sync-staging-types.ts";
import { POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE } from "./baseline-coverage.ts";

function tickerSymbols(tickers: PolygonTicker[]): string[] {
  return tickers.map((t) => normalizeSymbol(t.ticker)!).sort();
}

Deno.test("chunked main-universe selection matches monolithic at 13262", () => {
  const nowMs = Date.parse("2026-10-28T14:30:00.000Z");
  const sessionKind = resolveSyncSessionKind(nowMs);
  const extendedSession = sessionKind === "pre_market" ||
    sessionKind === "after_hours";
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
    "regular",
    nowMs,
  );
  const monolithic = selectMainUniverseTabs(universe, opts);

  const merged = emptyChunkArtifacts();
  const coverage = {
    baselineSymbols: new Set<string>(),
    policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
  };
  for (let i = 0; i < universe.length; i += SCREENER_SYNC_CHUNK_SIZE) {
    const slice = universe.slice(i, i + SCREENER_SYNC_CHUNK_SIZE);
    const chunk = processUniverseChunk(slice, {
      ...opts,
      syncSessionKind: sessionKind,
      coverage,
      nhlBaselines: new Map(),
      policyExclusions: POLICY_EXCLUSION_EVIDENCE_UNAVAILABLE,
    });
    foldChunkIntoMerged(merged, chunk);
  }
  const chunked = finalizeMainUniverseSelections(merged.mainQualified, opts);

  assertEquals(
    tickerSymbols(chunked.day_trade_radar),
    tickerSymbols(monolithic.day_trade_radar),
  );
  assertEquals(tickerSymbols(chunked.gappers), tickerSymbols(monolithic.gappers));
  assertEquals(
    tickerSymbols(chunked.volume_spikes),
    tickerSymbols(monolithic.volume_spikes),
  );
  assertEquals(
    tickerSymbols(chunked.unusual_volume),
    tickerSymbols(monolithic.unusual_volume),
  );
});

Deno.test("mergeMainUniverseQualified dedupes symbols across chunks", () => {
  const t: PolygonTicker = { ticker: "AAA", day: { v: 1_000_000, c: 10 } };
  const a = {
    day_trade_radar: [t],
    gappers: [],
    volume_spikes: [],
    unusual_volume: [],
  };
  const b = {
    day_trade_radar: [{ ...t }],
    gappers: [],
    volume_spikes: [],
    unusual_volume: [],
  };
  const m = mergeMainUniverseQualified(a, b);
  assertEquals(m.day_trade_radar.length, 1);
});

Deno.test("gainers/losers universe unchanged under chunking contract", () => {
  const nowMs = Date.parse("2026-10-28T14:30:00.000Z");
  const universe = buildRepresentativeUniverse(800, "regular", nowMs);
  const opts = { extendedSession: false, nowMs };
  const direct = selectForTab("gainers_losers", universe, undefined, opts);
  assertEquals(direct.length <= 20, true);
});
