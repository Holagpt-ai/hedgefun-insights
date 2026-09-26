import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assessSnapshot,
  computeBasis,
  normalizeBars,
  snapshotQualityForAnalysis,
} from "./market-data.ts";
import { evaluateSufficiency, MIN_BARS_FOR_AI } from "./sufficiency.ts";
import type { InputsQuality } from "./contract.ts";
import { resolveAnalysisSession } from "./session.ts";

const friSession = "2026-09-25";
const friCloseEt = Date.parse("2026-09-25T20:00:00Z");
const satMorning = new Date("2026-09-26T14:00:00Z");

function friSnapshotBody(lastTradeMs: number) {
  return {
    ticker: {
      ticker: "TSLA",
      prevDay: { c: 240, v: 50_000_000 },
      day: { c: 250, v: 60_000_000, vw: 248 },
      lastTrade: { t: lastTradeMs, p: 250 },
    },
  };
}

function sessionBars(count: number) {
  const raw = [];
  for (let i = 0; i < count; i++) {
    raw.push({
      t: friCloseEt - (count - 1 - i) * 60_000,
      o: 248, h: 251, l: 247, c: 249 + i * 0.01, v: 10_000,
    });
  }
  return normalizeBars(raw, friSession, satMorning).bars;
}

function qualityFromSnapshot(
  presentation: "live" | "last_completed",
  sessionDate: string,
  now: Date,
  lastTradeMs: number,
  barCount: number,
): InputsQuality["snapshot"] {
  const assessed = assessSnapshot(friSnapshotBody(lastTradeMs), now);
  const bars = sessionBars(barCount);
  return snapshotQualityForAnalysis(assessed, bars, now.getTime(), {
    presentation,
    sessionDate,
  });
}

const baseQuality = (snapshot: InputsQuality["snapshot"]): InputsQuality => ({
  snapshot,
  bars: "ok",
  prior_close: "ok",
  volume: "ok",
  rvol: "ok",
  events: "ok",
  bar_count: MIN_BARS_FOR_AI,
  feed_delay_note: "provider feed is 15-minute delayed",
  reason_codes: [],
  analysis_presentation: "last_completed",
  session_display_label: "Last completed session — Sep 25",
});

Deno.test("last_completed sufficiency: Friday snapshot on Saturday proceeds when evidence ok", () => {
  const snapshotQ = qualityFromSnapshot("last_completed", friSession, satMorning, friCloseEt, 12);
  assertEquals(snapshotQ, "ok");
  const r = evaluateSufficiency({
    quality: baseQuality(snapshotQ),
    price: 250,
    priorClose: 240,
    volume: 120_000,
    quoteValid: true,
  });
  assert(r.ok);
});

Deno.test("last_completed sufficiency: wrong session date stays SNAPSHOT_STALE", () => {
  const thuClose = Date.parse("2026-09-24T20:00:00Z");
  const snapshotQ = qualityFromSnapshot("last_completed", friSession, satMorning, thuClose, 12);
  assertEquals(snapshotQ, "stale");
  const r = evaluateSufficiency({
    quality: baseQuality(snapshotQ),
    price: 250,
    priorClose: 240,
    volume: 120_000,
    quoteValid: true,
  });
  assertEquals(r.failure_code, "SNAPSHOT_STALE");
});

Deno.test("last_completed sufficiency: missing price still PRICE_UNAVAILABLE", () => {
  const snapshotQ = qualityFromSnapshot("last_completed", friSession, satMorning, friCloseEt, 12);
  const r = evaluateSufficiency({
    quality: baseQuality(snapshotQ),
    price: null,
    priorClose: 240,
    volume: 120_000,
    quoteValid: true,
  });
  assertEquals(r.failure_code, "PRICE_UNAVAILABLE");
});

Deno.test("last_completed sufficiency: invalid quote price fails sufficiency", () => {
  const snapshotQ = qualityFromSnapshot("last_completed", friSession, satMorning, friCloseEt, 12);
  const assessed = assessSnapshot(
    {
      ticker: {
        ticker: "TSLA",
        prevDay: { c: 240, v: 50_000_000 },
        day: { c: 2500, v: 60_000_000, vw: 248 },
        lastTrade: { t: friCloseEt, p: 250 },
      },
    },
    satMorning,
  );
  const basis = computeBasis(sessionBars(12), assessed, "TSLA");
  assertEquals(basis.price, null);
  assertEquals(basis.quote?.valid, false);
  const r = evaluateSufficiency({
    quality: baseQuality(snapshotQ),
    price: basis.price,
    priorClose: 240,
    volume: basis.volume,
    quoteValid: basis.quote?.valid === true,
  });
  assert(r.failure_code === "PRICE_UNAVAILABLE" || r.failure_code === "QUOTE_REJECTED");
});

Deno.test("live after-hours stale snapshot still SNAPSHOT_STALE", () => {
  const ahNow = new Date("2026-09-26T00:30:00Z"); // Fri 20:30 ET
  const staleTrade = ahNow.getTime() - 2 * 60 * 60 * 1000;
  const assessed = assessSnapshot(friSnapshotBody(staleTrade), ahNow);
  const staleBars = normalizeBars(
    [{ t: staleTrade, o: 248, h: 251, l: 247, c: 249, v: 10_000 }],
    friSession,
    ahNow,
  ).bars;
  assertEquals(
    snapshotQualityForAnalysis(assessed, staleBars, ahNow.getTime(), {
      presentation: "live",
      sessionDate: friSession,
    }),
    "stale",
  );
});

Deno.test("live premarket stale snapshot still SNAPSHOT_STALE", () => {
  const preNow = new Date("2026-09-25T12:00:00Z"); // 08:00 ET
  const staleTrade = preNow.getTime() - 3 * 60 * 60 * 1000;
  const assessed = assessSnapshot(friSnapshotBody(staleTrade), preNow);
  const staleBars = normalizeBars(
    [{
      t: staleTrade,
      o: 248, h: 251, l: 247, c: 249, v: 10_000,
    }],
    friSession,
    preNow,
  ).bars;
  const snapshotQ = snapshotQualityForAnalysis(assessed, staleBars, preNow.getTime(), {
    presentation: "live",
    sessionDate: friSession,
  });
  assertEquals(snapshotQ, "stale");
  const r = evaluateSufficiency({
    quality: { ...baseQuality(snapshotQ), analysis_presentation: "live", session_display_label: "Pre-market" },
    price: 250,
    priorClose: 240,
    volume: 120_000,
    quoteValid: true,
  });
  assertEquals(r.failure_code, "SNAPSHOT_STALE");
});

Deno.test("resolveAnalysisSession preserves last_completed label on weekend", async () => {
  const r = await resolveAnalysisSession(satMorning, {
    fetchNow: () => Promise.resolve({ serverTime: "2026-09-26T10:00:00-04:00" }),
    fetchUpcoming: () => Promise.resolve([]),
  });
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.session.presentation, "last_completed");
    assertEquals(r.session.session_date, friSession);
    assert(r.session.session_display_label.includes("Sep 25"));
  }
});

Deno.test("last_completed: malformed snapshot is not upgraded", () => {
  const assessed = assessSnapshot(null, satMorning);
  assertEquals(assessed.quality, "malformed");
  assertEquals(
    snapshotQualityForAnalysis(assessed, sessionBars(12), satMorning.getTime(), {
      presentation: "last_completed",
      sessionDate: friSession,
    }),
    "malformed",
  );
});
