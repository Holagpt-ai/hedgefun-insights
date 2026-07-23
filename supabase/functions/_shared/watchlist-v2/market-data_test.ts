import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assessSnapshot, computeBasis, normalizeBars } from "./market-data.ts";

const sessionDate = "2026-07-23";
// 10:00 ET → 14:00 UTC for a weekday in summer
const now = new Date("2026-07-23T15:00:00Z");
const t930 = Date.parse("2026-07-23T13:30:00Z"); // 09:30 ET
const t931 = Date.parse("2026-07-23T13:31:00Z");

Deno.test("normalizeBars keeps valid bars, rejects malformed", () => {
  const r = normalizeBars(
    [
      { t: t930, o: 100, h: 101, l: 99, c: 100.5, v: 1000 },
      { t: t931, o: 100.5, h: 102, l: 100, c: 101, v: 800 },
      { t: t931, o: -1, h: 1, l: 1, c: 1, v: 1 }, // invalid → rejected
      { t: t931, o: 101, h: 102, l: 100, c: 101.5, v: 400 }, // dup t → last wins
    ],
    sessionDate,
    now,
  );
  assertEquals(r.bars.length, 2);
  assertEquals(r.bars[1].c, 101.5);
});

Deno.test("normalizeBars rejects future bars", () => {
  const r = normalizeBars(
    [{ t: now.getTime() + 60_000, o: 1, h: 1, l: 1, c: 1, v: 1 }],
    sessionDate,
    now,
  );
  assertEquals(r.bars.length, 0);
});

Deno.test("assessSnapshot flags stale timestamp", () => {
  const body = {
    ticker: {
      prevDay: { c: 100 }, day: { c: 101, v: 10_000 },
      lastTrade: { t: now.getTime() - 60 * 60 * 1000 },
    },
  };
  const a = assessSnapshot(body, now);
  assertEquals(a.quality, "stale");
});

Deno.test("assessSnapshot returns missing when no ticker", () => {
  assertEquals(assessSnapshot({}, now).quality, "missing");
});

Deno.test("computeBasis uses last bar price and cumulative volume", () => {
  const bars = [
    { t: t930, o: 100, h: 101, l: 99, c: 100.5, v: 1000 },
    { t: t931, o: 100.5, h: 102, l: 100, c: 101, v: 800 },
  ];
  const b = computeBasis(bars, { quality: "ok", lastTradeTs: t931, priorClose: 99.5, dayClose: 101, dayVolume: 20000 });
  assertEquals(b.price, 101);
  assertEquals(b.volume, 1800);
  assert(b.change_pct !== null && Math.abs(b.change_pct - ((101 - 99.5) / 99.5 * 100)) < 1e-6);
});
