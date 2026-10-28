/**
 * Regression: full-universe screener CPU path must stay bounded enough to publish.
 * Uses 13,262 symbols (production-scale count from Oct 28 CPU failure evidence).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildTabEvaluationEvidence } from "./evaluation-evidence.ts";
import {
  createSessionVolumeCache,
  sessionQualificationVolume,
} from "./session-volume.ts";
import {
  selectForTab,
  type PolygonTicker,
} from "./selection.ts";
import {
  accumulateRadarDiagnostic,
  createEmptyRadarRejectionSummary,
} from "./diagnostics.ts";

const UNIVERSE_SIZE = 13_262;
const NOW_MS = Date.parse("2026-10-28T16:45:00.000Z");

function mkTicker(i: number): PolygonTicker {
  const sym = `T${String(i).padStart(5, "0")}`;
  const price = 10 + (i % 50) / 10;
  return {
    ticker: sym,
    updated: NOW_MS * 1_000_000,
    day: { c: price, o: price - 0.1, v: 100_000 + (i % 10_000), h: price + 1, l: price - 1 },
    prevDay: { c: price - 0.5, v: 50_000 },
    min: { av: 100_000 + (i % 10_000), t: NOW_MS, v: 1_000 },
    lastTrade: { p: price, t: NOW_MS },
  };
}

function buildUniverse(): PolygonTicker[] {
  const out: PolygonTicker[] = [];
  for (let i = 0; i < UNIVERSE_SIZE; i++) out.push(mkTicker(i));
  return out;
}

Deno.test("cpu: session volume cache avoids repeated observation resolution", () => {
  const t = mkTicker(0);
  const cache = createSessionVolumeCache();
  const ctx = {
    observationSessionVolume: true,
    nowMs: NOW_MS,
    cache,
  };
  const first = sessionQualificationVolume(t, ctx);
  const second = sessionQualificationVolume(t, ctx);
  assertEquals(first, second);
  assertEquals(cache.qualificationVolume.has(t), true);
  assertEquals(cache.observationMs.has(t), true);
});

Deno.test({
  name: "cpu: 13,262-symbol selection + evidence path completes under budget",
  fn() {
    const universe = buildUniverse();
    const sessionVolumeCache = createSessionVolumeCache();
    const opts = {
      extendedSession: false,
      observationSessionFields: true,
      nowMs: NOW_MS,
      sessionVolumeCache,
    };

    const start = performance.now();
    const radarSummary = createEmptyRadarRejectionSummary();
    for (const t of universe) {
      accumulateRadarDiagnostic(radarSummary, t, NOW_MS, { syncSessionKind: "market" });
    }
    const gapperSelected = selectForTab("gappers", universe, 20, opts);
    const volumeSpikeSelected = selectForTab("volume_spikes", universe, 20, opts);
    const evidence = buildTabEvaluationEvidence({
      universe,
      dayTradeSelected: selectForTab("day_trade_radar", universe, 20),
      gapperSelected,
      volumeSpikeSelected,
      gainersLosersUniverse: universe.slice(0, 500),
      gainersLosersSelected: selectForTab("gainers_losers", universe.slice(0, 500), 20, opts),
      unusualSelected: selectForTab("unusual_volume", universe, 20, opts),
      nhlBaselineStatus: "unavailable",
      nhlBaselines: new Map(),
      nhlSelected: [],
      extendedSession: false,
      observationSessionFields: true,
      nowMs: NOW_MS,
      sessionVolumeCache,
    });
    const elapsedMs = performance.now() - start;

    assertEquals(radarSummary.evaluated, UNIVERSE_SIZE);
    assertEquals(evidence.gappers?.universe_count, UNIVERSE_SIZE);
    assertEquals(
      elapsedMs < 8_000,
      true,
      `universe cpu path took ${elapsedMs.toFixed(0)}ms (budget 8000ms)`,
    );
    console.log(
      `[sync-screener-universe-cpu] size=${UNIVERSE_SIZE} elapsed_ms=${elapsedMs.toFixed(1)}`,
    );
  },
  sanitizeOps: false,
  sanitizeResources: false,
});
