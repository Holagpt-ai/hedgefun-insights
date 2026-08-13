/**
 * Session-coherence regression: day-session price/move must use regular close
 * math, never todaysChangePerc beside day.c.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapTabRows, type GenerationMeta } from "./rows.ts";
import {
  previousRegularClose,
  qualifiesDayTradeRadar,
  regularChangePercent,
  regularClose,
  type PolygonTicker,
  volumeRatioPriorSession,
} from "./selection.ts";

const FIXED_ISO = "2026-08-12T22:45:00.000Z";
const FIXED_MS = Date.parse(FIXED_ISO);
const FIXED_NS = FIXED_MS * 1_000_000;
const META: GenerationMeta = {
  syncedAt: FIXED_ISO,
  syncRunId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  nowMs: FIXED_MS,
};

function boxl(): PolygonTicker {
  return {
    ticker: "BOXL",
    updated: FIXED_NS,
    todaysChangePerc: 132.42,
    day: { c: 7.87, o: 4.565, v: 65_500_000, h: 9.89, l: 4.2768 },
    prevDay: { c: 2.93, v: 5_409_723 },
    lastTrade: { p: 6.8, t: FIXED_NS },
    min: { c: 6.8, t: FIXED_MS },
  };
}

Deno.test("session: regularClose and regularChangePercent ignore todaysChangePerc", () => {
  const t = boxl();
  assertEquals(regularClose(t), 7.87);
  assertEquals(previousRegularClose(t), 2.93);
  const move = regularChangePercent(t);
  assertEquals(move !== null, true);
  assertEquals(Math.abs((move as number) - 168.60068259385666) < 1e-9, true);
  assertEquals(move === 132.42, false);
});

Deno.test("session: Day Trade Radar qualification uses regular-session move", () => {
  // Extended-total looks like +132% but regular is +168% — still qualifies.
  assertEquals(qualifiesDayTradeRadar(boxl()), true);

  // Fake extended spike via todaysChangePerc while regular move is flat.
  const mixed: PolygonTicker = {
    ticker: "FLAT",
    updated: FIXED_NS,
    todaysChangePerc: 50,
    day: { c: 10, o: 10, v: 10_000_000, h: 10.2, l: 9.8 },
    prevDay: { c: 9.8, v: 1_000_000 },
    lastTrade: { p: 14.7 },
  };
  // Regular move ≈ +2.04% — must NOT qualify on todaysChangePerc alone.
  assertEquals(qualifiesDayTradeRadar(mixed), false);
});

Deno.test("session: mapped Radar row price/change stay coherent", () => {
  const [row] = mapTabRows("day_trade_radar", [boxl()], (s) => s, META);
  assertEquals(row.price, 7.87);
  assertEquals(row.change_percent !== null, true);
  const prev = 2.93;
  const expected = ((row.price as number) - prev) / prev * 100;
  assertEquals(
    Math.abs((row.change_percent as number) - expected) < 1e-9,
    true,
  );
  assertEquals(row.change_percent === 132.42, false);
  assertEquals(row.volume, 65_500_000);
  assertEquals(row.prior_session_volume, 5_409_723);
  assertEquals(row.volume_ratio_prior_session, 12.1);
});

Deno.test("session: missing prevDay.c excludes change rather than fabricating", () => {
  const t: PolygonTicker = {
    ticker: "NOPREV",
    updated: FIXED_NS,
    todaysChangePerc: 40,
    day: { c: 5, o: 5, v: 8_000_000, h: 5.5, l: 4.5 },
    prevDay: { v: 1_000_000 },
  };
  assertEquals(regularChangePercent(t), null);
  assertEquals(qualifiesDayTradeRadar(t), false);
  const [row] = mapTabRows("gainers_losers", [t], (s) => s, META);
  assertEquals(row.price, 5);
  assertEquals(row.change_percent, null);
});

Deno.test("session: raw regular move 9.99% fails ≥10% qualification", () => {
  // (10.999 - 10) / 10 * 100 = 9.99
  const t: PolygonTicker = {
    ticker: "U10",
    updated: FIXED_NS,
    todaysChangePerc: 50,
    day: { c: 10.999, o: 10.999, v: 10_000_000, h: 11.5, l: 10 },
    prevDay: { c: 10, v: 1_000_000 },
  };
  assertEquals(Math.abs(regularChangePercent(t)! - 9.99) < 1e-9, true);
  assertEquals(qualifiesDayTradeRadar(t), false);
});

Deno.test("session: raw regular move 10.00% passes ≥10% qualification", () => {
  const t: PolygonTicker = {
    ticker: "EQ10",
    updated: FIXED_NS,
    todaysChangePerc: 1,
    day: { c: 11, o: 11, v: 10_000_000, h: 11.5, l: 10 },
    prevDay: { c: 10, v: 1_000_000 },
  };
  assertEquals(regularChangePercent(t), 10);
  assertEquals(qualifiesDayTradeRadar(t), true);
});

Deno.test("session: raw volume ratio below 5.0× cannot qualify via display rounding", () => {
  const t: PolygonTicker = {
    ticker: "R499",
    updated: FIXED_NS,
    todaysChangePerc: 1,
    day: { c: 11, o: 11, v: 4_999_999, h: 11.5, l: 10 },
    prevDay: { c: 10, v: 1_000_000 },
  };
  assertEquals(volumeRatioPriorSession(t), 5.0);
  assertEquals(qualifiesDayTradeRadar(t), false);
});
