import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateDayTradeRadar } from "./diagnostics.ts";
import { evaluateGappersEvidence } from "./evaluation-evidence.ts";
import { mapTabRows, type GenerationMeta } from "./rows.ts";
import {
  qualifiesVolumeSpikes,
  selectForTab,
  selectVolumeFirst,
  type PolygonTicker,
  volumeRatioPriorSession,
} from "./selection.ts";
import {
  afterHoursIncrementalVolume,
  premarketAccumulatedVolume,
  regularSessionVolume,
  sessionQualificationVolume,
} from "./session-volume.ts";

const PREMARKET_MS = Date.parse("2026-10-28T13:17:00.000Z"); // 9:17 ET
const REGULAR_MS = Date.parse("2026-10-28T14:30:00.000Z"); // 10:30 ET
const AFTER_HOURS_MS = Date.parse("2026-10-28T21:00:00.000Z"); // 5:00 PM ET

function nvdaPremarket(): PolygonTicker {
  return {
    ticker: "NVDA",
    updated: PREMARKET_MS * 1_000_000,
    day: { v: 0, c: 0 },
    min: { av: 1_704_688, v: 7_106, t: PREMARKET_MS },
    prevDay: { c: 140, v: 400_000 },
    lastTrade: { p: 142.5, t: PREMARKET_MS * 1_000_000 },
  };
}

Deno.test("premarket: day.v=0 with positive min.av qualifies volume", () => {
  const t = nvdaPremarket();
  assertEquals(regularSessionVolume(t), null);
  assertEquals(premarketAccumulatedVolume(t), 1_704_688);
  const ctx = { extendedSession: true, nowMs: PREMARKET_MS };
  assertEquals(sessionQualificationVolume(t, ctx), 1_704_688);
  // Server clock in RTH but provider observation still premarket → keep min.av.
  const delayedPremarketMs = Date.parse("2026-10-28T13:20:00.000Z"); // 9:20 ET
  const delayed = {
    ...t,
    min: { ...t.min!, t: delayedPremarketMs },
    updated: delayedPremarketMs * 1_000_000,
  };
  assertEquals(
    sessionQualificationVolume(delayed, {
      observationSessionVolume: true,
      nowMs: REGULAR_MS,
    }),
    1_704_688,
  );
});

Deno.test("premarket: positive min.v without min.av stays unavailable", () => {
  const t: PolygonTicker = {
    ticker: "AAPL",
    day: { v: 0 },
    min: { v: 277_453 },
    prevDay: { v: 40_000_000 },
  };
  assertEquals(
    sessionQualificationVolume(t, { extendedSession: true, nowMs: PREMARKET_MS }),
    null,
  );
});

Deno.test("regular session: positive day.v unchanged", () => {
  const t: PolygonTicker = { ticker: "MSFT", day: { v: 12_345_678 }, prevDay: { v: 10_000_000 } };
  assertEquals(sessionQualificationVolume(t, { extendedSession: false }), 12_345_678);
  assertEquals(sessionQualificationVolume(t, {}), 12_345_678);
});

Deno.test("after-hours: incremental volume when min.av exceeds day.v", () => {
  const t: PolygonTicker = {
    ticker: "SPY",
    updated: AFTER_HOURS_MS * 1_000_000,
    day: { v: 50_000_000 },
    min: { av: 50_355_960, t: AFTER_HOURS_MS },
  };
  assertEquals(afterHoursIncrementalVolume(t), 355_960);
  assertEquals(
    sessionQualificationVolume(t, { extendedSession: true, nowMs: AFTER_HOURS_MS }),
    355_960,
  );
});

Deno.test("after-hours: min.av without regular day.v baseline stays unavailable", () => {
  const t: PolygonTicker = { ticker: "SPY", day: { v: 0 }, min: { av: 355_960 } };
  assertEquals(
    sessionQualificationVolume(t, { extendedSession: true, nowMs: AFTER_HOURS_MS }),
    null,
  );
});

Deno.test("volume spikes and gappers select with premarket accumulation", () => {
  const t = nvdaPremarket();
  const ctx = { extendedSession: true, nowMs: PREMARKET_MS };
  assertEquals(qualifiesVolumeSpikes(t, ctx), true);
  const spikes = selectForTab("volume_spikes", [t], 20, ctx);
  assertEquals(spikes.length, 1);
  assertEquals(spikes[0].ticker, "NVDA");

  const gappers = selectForTab(
    "gappers",
    [{ ...t, lastTrade: { p: 147, t: PREMARKET_MS * 1_000_000 } }],
    20,
    ctx,
  );
  assertEquals(gappers.length, 1);
});

Deno.test("gappers evidence reports evaluated when accumulation exists", () => {
  const universe = [nvdaPremarket()];
  const selected = selectForTab("gappers", universe, 20, {
    extendedSession: true,
    nowMs: PREMARKET_MS,
  });
  const evidence = evaluateGappersEvidence(
    universe,
    selected,
    undefined,
    true,
    PREMARKET_MS,
  );
  assertEquals(evidence.status, "evaluated");
  assertEquals(evidence.volume_positive_count, 1);
  assertEquals(evidence.reason, undefined);
});

Deno.test("persisted row volume and ratio use session accumulation", () => {
  const meta: GenerationMeta = {
    syncedAt: new Date(PREMARKET_MS).toISOString(),
    syncRunId: "11111111-2222-3333-4444-555555555555",
    nowMs: PREMARKET_MS,
    extendedSession: true,
  };
  const [row] = mapTabRows("volume_spikes", [nvdaPremarket()], (s) => s, meta);
  assertEquals(row.volume, 1_704_688);
  assertEquals(row.prior_session_volume, 400_000);
  assertEquals(row.volume_ratio_prior_session !== null && row.volume_ratio_prior_session >= 3, true);
  const ratio = volumeRatioPriorSession(nvdaPremarket(), {
    extendedSession: true,
    nowMs: PREMARKET_MS,
  });
  assertEquals(ratio !== null && ratio > 0, true);
});

Deno.test("volume-first ordering uses accumulated volume for dedupe", () => {
  const low: PolygonTicker = {
    ticker: "AAA",
    day: { v: 0 },
    min: { av: 100_000, t: PREMARKET_MS },
    updated: PREMARKET_MS * 1_000_000,
  };
  const high: PolygonTicker = {
    ticker: "aaa",
    day: { v: 0 },
    min: { av: 900_000, t: PREMARKET_MS },
    updated: PREMARKET_MS * 1_000_000,
  };
  const ctx = { extendedSession: true, nowMs: PREMARKET_MS };
  const selected = selectVolumeFirst([low, high], 20, ctx);
  assertEquals(selected.length, 1);
  assertEquals(selected[0].ticker, "AAA");
});

Deno.test("day trade diagnostics omit missing_invalid_snapshot for premarket regular fields", () => {
  const diag = evaluateDayTradeRadar(nvdaPremarket(), PREMARKET_MS, {
    syncSessionKind: "pre-market",
  });
  assertEquals(diag.reasons.includes("missing_invalid_snapshot"), false);
  assertEquals(diag.reasons.includes("minimum_volume_failure"), true);
});
