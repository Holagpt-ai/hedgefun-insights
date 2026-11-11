import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  OVERNIGHT_SCANNER_PIPELINE_READY,
  resolveEquitySession,
  resolveOvernightCycleAt,
  EQUITY_23X5_DISABLED,
  type Equity23x5Activation,
} from "../markets/equity-session-control.ts";
import {
  equityTradeDateForVolume,
  surveillanceTradingDateFromMs,
} from "./screener-session.ts";
import {
  qualificationObservationKind,
  resolveObservationSessionKindAt,
  resolveScannerObservationSessionFields,
  resolveSyncSessionKind,
  syncAllowsOvernightObservationVolume,
} from "./session-sync-context.ts";
import type { PolygonTicker } from "./selection.ts";
import { gapPercentForTabContext } from "./selection.ts";
import {
  afterHoursIncrementalVolume,
  OVERNIGHT_PROVIDER_SESSION_VOLUME_VERIFIED,
  overnightSessionVolume,
  overnightVolumeProvenance,
  resolveObservationSessionKind,
  sessionQualificationVolume,
} from "./session-volume.ts";
import {
  premarketAccumulatedVolume,
  regularSessionVolume,
} from "./session-volume.ts";

const ACTIVE: Equity23x5Activation = {
  ownerAuthorized: true,
  exchangeEffectiveDate: "2026-11-09",
  providerOvernightConfirmed: true,
};

const SUNDAY_OPEN = Date.parse("2026-11-09T02:00:00Z"); // Sun 2026-11-08 21:00 EST → Mon cycle
const MON_OVERNIGHT = Date.parse("2026-11-10T05:00:00Z"); // Mon 00:00 EST
const MON_PREMARKET = Date.parse("2026-11-10T09:00:00Z"); // Mon 04:00 EST
const SYNC_0405_ET = Date.parse("2026-11-10T09:05:00.000Z"); // Mon 04:05 EST
const OBS_0359_ET = Date.parse("2026-11-10T08:59:00.000Z"); // Mon 03:59 EST
const FRI_CLOSE = Date.parse("2026-11-14T01:30:00Z"); // Fri 20:30 EST maintenance
const SAT_NOON = Date.parse("2026-11-14T17:00:00Z");

function overnightTicker(partial: {
  obsMs: number;
  minAv: number;
  dayV?: number;
  dayVPresent?: boolean;
  prevClose?: number;
}): PolygonTicker {
  const day: { v: unknown; c: number } = { c: 0, v: partial.dayV ?? 0 };
  if (partial.dayVPresent === false) {
    return {
      ticker: "AAPL",
      updated: partial.obsMs * 1_000_000,
      day: { c: 0 },
      min: { av: partial.minAv, t: partial.obsMs, c: 101 },
      prevDay: { c: partial.prevClose ?? 100, v: 1_000_000 },
      lastTrade: { p: 101, t: partial.obsMs },
    };
  }
  return {
    ticker: "AAPL",
    updated: partial.obsMs * 1_000_000,
    day,
    min: { av: partial.minAv, t: partial.obsMs, c: 101 },
    prevDay: { c: partial.prevClose ?? 100, v: 1_000_000 },
    lastTrade: { p: 101, t: partial.obsMs },
  };
}

Deno.test("Batch 221: Sunday 21:00 ET observation belongs to Monday trade date", () => {
  const cycle = resolveOvernightCycleAt(SUNDAY_OPEN, []);
  assertEquals(cycle?.tradeDate, "2026-11-09");
  assertEquals(equityTradeDateForVolume(SUNDAY_OPEN, []), "2026-11-09");
  assertEquals(resolveObservationSessionKindAt(SUNDAY_OPEN, []), "overnight");
});

Deno.test("Batch 221: 04:05 premarket sync rejects 03:59 overnight observation volume", () => {
  assertEquals(resolveSyncSessionKind(SYNC_0405_ET), "pre-market");
  assertEquals(resolveObservationSessionKindAt(OBS_0359_ET, []), "overnight");
  assertEquals(
    qualificationObservationKind(OBS_0359_ET, SYNC_0405_ET, [], false),
    null,
  );
  const t = overnightTicker({ obsMs: OBS_0359_ET, minAv: 500_000, dayV: 0 });
  assertEquals(
    sessionQualificationVolume(t, {
      observationSessionVolume: true,
      nowMs: SYNC_0405_ET,
      overnightPipelineReady: false,
    }),
    null,
  );
  assertEquals(
    sessionQualificationVolume(t, {
      observationSessionVolume: true,
      nowMs: SYNC_0405_ET,
      overnightPipelineReady: true,
    }),
    null,
  );
});

Deno.test("Batch 221: midnight rollover keeps the same Monday cycle", () => {
  assertEquals(equityTradeDateForVolume(MON_OVERNIGHT, []), "2026-11-10");
  const beforeMidnight = Date.parse("2026-11-10T04:59:00Z");
  const afterMidnight = Date.parse("2026-11-10T05:01:00Z");
  assertEquals(equityTradeDateForVolume(beforeMidnight, []), "2026-11-10");
  assertEquals(equityTradeDateForVolume(afterMidnight, []), "2026-11-10");
});

Deno.test("Batch 221: Friday night and Saturday stay out of overnight volume cycle", () => {
  assertEquals(resolveOvernightCycleAt(FRI_CLOSE, []), null);
  assertEquals(resolveObservationSessionKindAt(FRI_CLOSE, []), "closed");
  assertEquals(resolveOvernightCycleAt(SAT_NOON, []), null);
});

Deno.test("Batch 221: DST fall-forward Sunday still maps wall-clock 21:00", () => {
  const fallOpen = Date.parse("2026-11-02T02:00:00Z");
  assertEquals(resolveOvernightCycleAt(fallOpen, [])?.tradeDate, "2026-11-02");
  const before = Date.parse("2026-11-02T01:59:00Z");
  assertEquals(resolveOvernightCycleAt(before, []), null);
});

Deno.test("Batch 221: after-hours cumulative is never overnight volume", () => {
  const ahMs = Date.parse("2026-10-28T20:20:00.000Z"); // 4:20 PM ET after-hours
  const t = overnightTicker({ obsMs: ahMs, minAv: 50_400_000, dayV: 50_000_000 });
  assertEquals(afterHoursIncrementalVolume(t), 400_000);
  assertEquals(overnightSessionVolume(t, ahMs, [], true), null);
  const ahKind = resolveObservationSessionKindAt(ahMs, []);
  assertEquals(ahKind, "after-hours");
  assertEquals(
    sessionQualificationVolume(t, { observationSessionVolume: true, nowMs: ahMs }),
    400_000,
  );
});

Deno.test("Batch 221: missing day.v does not prove overnight-only min.av", () => {
  const t = overnightTicker({
    obsMs: MON_OVERNIGHT,
    minAv: 125_000,
    dayVPresent: false,
  });
  assertEquals(overnightSessionVolume(t, MON_OVERNIGHT, [], true), null);
});

Deno.test("Batch 221: overnight volume unavailable until provider session reset is verified", () => {
  assertEquals(OVERNIGHT_PROVIDER_SESSION_VOLUME_VERIFIED, false);
  const t = overnightTicker({ obsMs: MON_OVERNIGHT, minAv: 125_000, dayV: 0 });
  assertEquals(overnightSessionVolume(t, MON_OVERNIGHT, []), null);
  const ctx = {
    observationSessionVolume: true,
    nowMs: MON_OVERNIGHT,
    overnightPipelineReady: true,
  };
  assertEquals(sessionQualificationVolume(t, ctx), null);
  assertEquals(syncAllowsOvernightObservationVolume(MON_OVERNIGHT, [], true), true);
  assertEquals(overnightVolumeProvenance(t, MON_OVERNIGHT, ctx), null);
});

Deno.test("Batch 221: verified-provider fixture path rejects AH carry-forward", () => {
  const t = overnightTicker({
    obsMs: MON_OVERNIGHT,
    minAv: 50_400_000,
    dayV: 50_000_000,
  });
  assertEquals(overnightSessionVolume(t, MON_OVERNIGHT, [], true), null);
});

Deno.test("Batch 221: verified-provider fixture accepts explicit zero day.v in overnight", () => {
  const t = overnightTicker({ obsMs: MON_OVERNIGHT, minAv: 125_000, dayV: 0 });
  assertEquals(overnightSessionVolume(t, MON_OVERNIGHT, [], true), 125_000);
});

Deno.test("Batch 221: stale observation on a prior trade date is unavailable", () => {
  const priorPremarket = Date.parse("2026-11-10T13:30:00Z");
  const t = overnightTicker({ obsMs: priorPremarket, minAv: 50_000 });
  assertEquals(
    sessionQualificationVolume(t, { observationSessionVolume: true, nowMs: MON_OVERNIGHT }),
    null,
  );
});

Deno.test("Batch 221: missing overnight evidence stays unavailable", () => {
  const t: PolygonTicker = { ticker: "X", day: { v: 0 }, min: { av: 10_000 } };
  assertEquals(
    sessionQualificationVolume(t, { observationSessionVolume: true, nowMs: MON_OVERNIGHT }),
    null,
  );
});

Deno.test("Batch 221: premarket/RTH/AH session volumes unchanged", () => {
  const pm = Date.parse("2026-10-28T13:17:00.000Z");
  const t: PolygonTicker = { ticker: "N", day: { v: 0 }, min: { av: 1_000, t: pm } };
  assertEquals(premarketAccumulatedVolume(t), 1_000);
  const rth: PolygonTicker = { ticker: "N", day: { v: 9_000 } };
  assertEquals(regularSessionVolume(rth), 9_000);
  assertEquals(resolveSyncSessionKind(pm), "pre-market");
  assertEquals(equityTradeDateForVolume(pm, []), surveillanceTradingDateFromMs(pm));
  assertEquals(
    sessionQualificationVolume(t, { observationSessionVolume: true, nowMs: pm }),
    1_000,
  );
});

Deno.test("Batch 221: Sunday night does not qualify premarket volume with pipeline disabled", () => {
  const t = overnightTicker({ obsMs: SUNDAY_OPEN, minAv: 200_000, dayV: 0 });
  assertEquals(
    sessionQualificationVolume(t, {
      observationSessionVolume: true,
      nowMs: MON_PREMARKET,
      overnightPipelineReady: false,
    }),
    null,
  );
});

Deno.test("Batch 221: overnight gappers unavailable on stale overnight stamp at premarket", () => {
  const t = overnightTicker({ obsMs: OBS_0359_ET, minAv: 80_000, prevClose: 50 });
  const gap = gapPercentForTabContext(t, {
    observationSessionFields: true,
    nowMs: SYNC_0405_ET,
  });
  assertEquals(gap, null);
});

Deno.test("Batch 221: production scan gate stays off while pipeline flag is false", () => {
  assertEquals(OVERNIGHT_SCANNER_PIPELINE_READY, false);
  assertEquals(resolveScannerObservationSessionFields(MON_OVERNIGHT, []), false);
  const session = resolveEquitySession({
    nowMs: MON_OVERNIGHT,
    exceptions: [],
    activation: ACTIVE,
    overnightPipelineReady: false,
  });
  assertEquals(session?.scanEligible, false);
  assertEquals(session?.skipReason, "overnight_pipeline_not_ready");
});

Deno.test("Batch 221: observation fields would enable only when pipeline flag is true", () => {
  assertEquals(resolveObservationSessionKindAt(SUNDAY_OPEN, []), "overnight");
  assertEquals(
    resolveScannerObservationSessionFields(SUNDAY_OPEN, [], true),
    true,
  );
  const ready = resolveEquitySession({
    nowMs: MON_OVERNIGHT,
    exceptions: [],
    activation: ACTIVE,
    overnightPipelineReady: true,
  });
  assertEquals(ready?.scanEligible, true);
});
