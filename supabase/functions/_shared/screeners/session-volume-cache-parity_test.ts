import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildTabEvaluationEvidence } from "./evaluation-evidence.ts";
import { selectNewHighsLows, type NhlBaselineQuote } from "./new-highs-lows.ts";
import { mapTabRows, type GenerationMeta } from "./rows.ts";
import {
  selectForTab,
  selectMainUniverseTabs,
  type PolygonTicker,
} from "./selection.ts";
import {
  createSessionVolumeCache,
  sessionQualificationVolume,
  sessionVolumeCacheMatchesContext,
  type SessionVolumeCacheBinding,
} from "./session-volume.ts";

function etMs(hour: number, minute: number): number {
  return Date.UTC(2026, 9, 28, hour + 4, minute, 0, 0);
}

const SERVER_PM = etMs(9, 35);
const OBS_PM = etMs(9, 20);
const SERVER_RTH = etMs(9, 46);
const OBS_RTH = etMs(9, 31);
const SERVER_AH = etMs(16, 20);
const OBS_AH = etMs(16, 5);

function ticker(partial: {
  sym: string;
  minT: number;
  dayV: number;
  minAv: number;
  last?: number;
  prevClose?: number;
}): PolygonTicker {
  const last = partial.last ?? 12;
  return {
    ticker: partial.sym,
    updated: partial.minT * 1_000_000,
    day: { v: partial.dayV, c: last, o: last - 0.1 },
    prevDay: { c: partial.prevClose ?? 8, v: 100_000 },
    min: { av: partial.minAv, v: 1_000, t: partial.minT },
    lastTrade: { p: last, t: partial.minT },
  };
}

function binding(nowMs: number, observationSessionFields: boolean): SessionVolumeCacheBinding {
  return {
    nowMs,
    observationSessionVolume: observationSessionFields,
    extendedSession: false,
  };
}

function runPipeline(
  universe: PolygonTicker[],
  nowMs: number,
  useCache: boolean,
  useSinglePass: boolean,
) {
  const b = binding(nowMs, true);
  const cache = useCache ? createSessionVolumeCache(b) : undefined;
  const opts = {
    extendedSession: false,
    observationSessionFields: true,
    nowMs,
    sessionVolumeCache: cache,
  };
  const tabs = useSinglePass
    ? selectMainUniverseTabs(universe, opts)
    : {
      day_trade_radar: selectForTab("day_trade_radar", universe),
      gappers: selectForTab("gappers", universe, 20, opts),
      volume_spikes: selectForTab("volume_spikes", universe, 20, opts),
      unusual_volume: selectForTab("unusual_volume", universe, 20, opts),
    };
  const gainersLosers = selectForTab("gainers_losers", universe, 20, opts);
  const baselines = new Map<string, NhlBaselineQuote>([
    ["PMGAP", { symbol: "PMGAP", high_52w: 50, low_52w: 4, sessions_observed: 200 }],
  ]);
  const nhl = selectNewHighsLows(
    universe,
    baselines,
    20,
    false,
    nowMs,
    true,
    cache,
  );
  const meta: GenerationMeta = {
    syncedAt: new Date(nowMs).toISOString(),
    syncRunId: "11111111-2222-3333-4444-555555555555",
    nowMs,
    extendedSession: false,
    observationSessionFields: true,
    sessionVolumeCache: cache,
  };
  const rows = [
    ...mapTabRows("gappers", tabs.gappers, (s) => s, meta),
    ...mapTabRows("gainers_losers", gainersLosers, (s) => s, meta),
    ...mapTabRows("volume_spikes", tabs.volume_spikes, (s) => s, meta),
  ];
  const evidence = buildTabEvaluationEvidence({
    universe,
    dayTradeSelected: tabs.day_trade_radar,
    gapperSelected: tabs.gappers,
    volumeSpikeSelected: tabs.volume_spikes,
    gainersLosersUniverse: universe,
    gainersLosersSelected: gainersLosers,
    unusualSelected: tabs.unusual_volume,
    nhlBaselineStatus: "available",
    nhlBaselines: baselines,
    nhlSelected: nhl,
    extendedSession: false,
    observationSessionFields: true,
    nowMs,
    sessionVolumeCache: cache,
  });
  return { tabs, gainersLosers, nhl, rows, evidence };
}

function tabSymbols(tickers: PolygonTicker[]): string[] {
  return tickers.map((t) => String(t.ticker));
}

Deno.test("cache parity: premarket delayed observation matches uncached pipeline", () => {
  const universe = [
    ticker({ sym: "PMGAP", minT: OBS_PM, dayV: 0, minAv: 900_000, last: 12, prevClose: 8 }),
    ticker({ sym: "FLAT", minT: OBS_PM, dayV: 0, minAv: 500_000, last: 8.2, prevClose: 8 }),
  ];
  const uncached = runPipeline(universe, SERVER_PM, false, false);
  const cached = runPipeline(universe, SERVER_PM, true, true);
  assertEquals(tabSymbols(cached.tabs.gappers), tabSymbols(uncached.tabs.gappers));
  assertEquals(cached.rows, uncached.rows);
  assertEquals(cached.evidence.gappers, uncached.evidence.gappers);
});

Deno.test("cache parity: regular and after-hours observations", () => {
  const rth = [
    ticker({ sym: "REG", minT: OBS_RTH, dayV: 2_000_000, minAv: 2_100_000, last: 10.5, prevClose: 10 }),
  ];
  assertEquals(
    runPipeline(rth, SERVER_RTH, true, true).evidence.gappers,
    runPipeline(rth, SERVER_RTH, false, false).evidence.gappers,
  );
  const ah = [
    ticker({ sym: "AH", minT: OBS_AH, dayV: 40_000_000, minAv: 40_250_000, last: 51, prevClose: 48 }),
  ];
  assertEquals(
    runPipeline(ah, SERVER_AH, true, true).rows,
    runPipeline(ah, SERVER_AH, false, false).rows,
  );
});

Deno.test("cache parity: contradictory timestamps fail closed with and without cache", () => {
  const bad: PolygonTicker = {
    ticker: "BAD",
    updated: OBS_PM * 1_000_000,
    day: { v: 0, c: 12, o: 12 },
    prevDay: { c: 8, v: 100_000 },
    min: { av: 500_000, v: 1_000, t: OBS_RTH },
    lastTrade: { p: 12, t: OBS_PM },
  };
  const ctx = {
    observationSessionVolume: true,
    nowMs: SERVER_PM,
    cache: createSessionVolumeCache(binding(SERVER_PM, true)),
  };
  assertEquals(sessionQualificationVolume(bad, ctx), null);
  assertEquals(sessionQualificationVolume(bad, { ...ctx, cache: undefined }), null);
});

Deno.test("cache binding rejects mismatched evaluation context", () => {
  const t = ticker({ sym: "X", minT: OBS_PM, dayV: 0, minAv: 100_000 });
  const cache = createSessionVolumeCache(binding(SERVER_PM, true));
  const vol = sessionQualificationVolume(t, {
    observationSessionVolume: true,
    nowMs: SERVER_PM,
    cache,
  });
  assertEquals(
    sessionVolumeCacheMatchesContext(cache, {
      observationSessionVolume: true,
      nowMs: SERVER_RTH,
      cache,
    }),
    false,
  );
  assertEquals(
    sessionQualificationVolume(t, {
      observationSessionVolume: true,
      nowMs: SERVER_RTH,
      cache,
    }),
    sessionQualificationVolume(t, {
      observationSessionVolume: true,
      nowMs: SERVER_RTH,
    }),
  );
  assertEquals(vol, 100_000);
});
