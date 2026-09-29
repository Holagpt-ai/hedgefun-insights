/**
 * Extended-session MOVE: last vs prior regular close (prevDay.c).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapTabRows, type GenerationMeta } from "./rows.ts";
import {
  changePercentVsPriorRegularClose,
  extendedSessionLastPrice,
  type PolygonTicker,
} from "./selection.ts";

const PREMARKET_MS = Date.parse("2026-09-29T08:05:00.000Z"); // 04:05 ET
const META: GenerationMeta = {
  syncedAt: new Date(PREMARKET_MS).toISOString(),
  syncRunId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  nowMs: PREMARKET_MS,
  extendedSession: true,
};

function bkyi(): PolygonTicker {
  return {
    ticker: "BKYI",
    updated: PREMARKET_MS * 1_000_000,
    day: { v: 1_300_000 },
    prevDay: { c: 2.35, v: 94_000 },
    lastTrade: { p: 2.71, t: PREMARKET_MS * 1_000_000 },
  };
}

Deno.test("extended: lastTrade supplies premarket last", () => {
  const t = bkyi();
  assertEquals(extendedSessionLastPrice(t), 2.71);
  const move = changePercentVsPriorRegularClose(2.71, t);
  assertEquals(move !== null, true);
  assertEquals(Math.abs((move as number) - 15.319148936170212) < 1e-6, true);
});

Deno.test("extended: unusual_volume row maps MOVE from last vs prevDay.c", () => {
  const [row] = mapTabRows("unusual_volume", [bkyi()], (s) => s, META);
  assertEquals(row.price, 2.71);
  assertEquals(row.change_percent !== null, true);
  assertEquals(row.prior_session_volume, 94_000);
  assertEquals(row.volume_ratio_prior_session, 13.8);
});
