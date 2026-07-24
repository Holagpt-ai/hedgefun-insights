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

Deno.test("assessSnapshot: fresh lastTrade timestamp passes", () => {
  const body = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, lastTrade: { t: now.getTime() - 60_000 } } };
  assertEquals(assessSnapshot(body, now).quality, "ok");
});

Deno.test("assessSnapshot: fresh lastQuote timestamp passes", () => {
  const body = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, lastQuote: { t: now.getTime() - 60_000 } } };
  assertEquals(assessSnapshot(body, now).quality, "ok");
});

Deno.test("assessSnapshot: fresh ticker.updated (ns) passes without trade/quote", () => {
  const body = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, updated: (now.getTime() - 60_000) * 1e6 } };
  const a = assessSnapshot(body, now);
  assertEquals(a.quality, "ok");
  assert(a.lastTradeTs !== null && Math.abs(a.lastTradeTs - (now.getTime() - 60_000)) < 5);
});

Deno.test("assessSnapshot: fresh min.t (ms) passes without trade/quote", () => {
  const body = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, min: { t: now.getTime() - 30_000 } } };
  assertEquals(assessSnapshot(body, now).quality, "ok");
});

Deno.test("assessSnapshot: newest valid candidate wins", () => {
  const body = {
    ticker: {
      prevDay: { c: 100 }, day: { c: 101, v: 1 },
      lastTrade: { t: now.getTime() - 40 * 60 * 1000 },
      min: { t: now.getTime() - 60_000 },
    },
  };
  const a = assessSnapshot(body, now);
  assertEquals(a.quality, "ok");
  assert(a.lastTradeTs !== null && a.lastTradeTs >= now.getTime() - 60_000 - 5);
});

Deno.test("assessSnapshot: 44min age passes; 46min is stale", () => {
  const ok = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, lastTrade: { t: now.getTime() - 44 * 60 * 1000 } } };
  const stale = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, lastTrade: { t: now.getTime() - 46 * 60 * 1000 } } };
  assertEquals(assessSnapshot(ok, now).quality, "ok");
  assertEquals(assessSnapshot(stale, now).quality, "stale");
});

Deno.test("assessSnapshot: future timestamp (>5min) is rejected", () => {
  const body = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, lastTrade: { t: now.getTime() + 10 * 60 * 1000 } } };
  assertEquals(assessSnapshot(body, now).quality, "missing");
});

Deno.test("assessSnapshot: malformed timestamps rejected", () => {
  const body = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 }, lastTrade: { t: "nope" }, min: { t: -1 }, updated: NaN } };
  assertEquals(assessSnapshot(body, now).quality, "missing");
});

Deno.test("assessSnapshot: no permitted timestamp remains missing (SNAPSHOT_MISSING)", () => {
  const body = { ticker: { prevDay: { c: 100 }, day: { c: 101, v: 1 } } };
  assertEquals(assessSnapshot(body, now).quality, "missing");
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
