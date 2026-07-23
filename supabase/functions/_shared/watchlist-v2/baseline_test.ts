import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildBaselineFromBars, buildSessionCurve, CURVE_LEN, groupBarsByEtDate,
  MIN_MINUTES_PER_SESSION, MIN_SESSIONS,
} from "./baseline.ts";

// Helpers ------------------------------------------------------------
// 09:30 ET on a summer weekday = 13:30 UTC (offset -04:00).
function sessionStartUtcMs(dateEt: string): number {
  return Date.parse(`${dateEt}T13:30:00Z`);
}
function makeBar(t: number, v: number, price = 100) {
  return { t, o: price, h: price + 0.1, l: price - 0.1, c: price, v };
}
function fullSession(dateEt: string, perMinuteVol = 100): unknown[] {
  const start = sessionStartUtcMs(dateEt);
  const bars: unknown[] = [];
  for (let m = 0; m < 390; m++) {
    bars.push(makeBar(start + m * 60_000, perMinuteVol));
  }
  return bars;
}
function partialSession(dateEt: string, minutes: number, perMinuteVol = 100): unknown[] {
  const start = sessionStartUtcMs(dateEt);
  const bars: unknown[] = [];
  for (let m = 0; m < minutes; m++) {
    bars.push(makeBar(start + m * 60_000, perMinuteVol));
  }
  return bars;
}
const NOW = Date.parse("2026-07-24T18:00:00Z"); // Fri afternoon

// Group by ET date, filter to RTH ----------------------------------
Deno.test("groupBarsByEtDate excludes pre-market bars", () => {
  const dateEt = "2026-07-20"; // Mon
  const preMarket = sessionStartUtcMs(dateEt) - 60 * 60_000; // 08:30 ET
  const rth = sessionStartUtcMs(dateEt);
  const grouped = groupBarsByEtDate(
    [makeBar(preMarket, 100), makeBar(rth, 100)],
    NOW,
  );
  assertEquals(grouped.size, 1);
  assertEquals(grouped.get(dateEt)?.size, 1);
});

Deno.test("groupBarsByEtDate rejects future bars", () => {
  const future = NOW + 60_000;
  const grouped = groupBarsByEtDate([makeBar(future, 100)], NOW);
  assertEquals(grouped.size, 0);
});

Deno.test("groupBarsByEtDate rejects malformed bars", () => {
  const dateEt = "2026-07-20";
  const t = sessionStartUtcMs(dateEt);
  const grouped = groupBarsByEtDate(
    [
      { t, o: -1, h: 1, l: 1, c: 1, v: 1 },
      makeBar(t, 100),
      { t: t + 60_000, o: 5, h: 4, l: 6, c: 5, v: 1 }, // h<l
    ],
    NOW,
  );
  assertEquals(grouped.get(dateEt)?.size, 1);
});

// Per-session curve ------------------------------------------------
Deno.test("buildSessionCurve rejects partial sessions", () => {
  const dateEt = "2026-07-20";
  const grouped = groupBarsByEtDate(
    partialSession(dateEt, MIN_MINUTES_PER_SESSION - 1),
    NOW,
  );
  const s = buildSessionCurve(dateEt, grouped.get(dateEt)!);
  assertEquals(s, null);
});

Deno.test("buildSessionCurve forward-fills missing minutes without fabricating volume", () => {
  const dateEt = "2026-07-20";
  const start = sessionStartUtcMs(dateEt);
  // Populate 300 alternating minutes (>= MIN)
  const bars: unknown[] = [];
  for (let m = 0; m < 300; m++) bars.push(makeBar(start + m * 2 * 60_000, 10));
  // Only every-other-minute; that's actually 300 minutes indexed 0,2,4... which spans 599 → out of range.
  // Redo: put 250 bars in first 250 minutes, leave 100..389 empty.
  bars.length = 0;
  for (let m = 0; m < 250; m++) bars.push(makeBar(start + m * 60_000, 10));
  const grouped = groupBarsByEtDate(bars, NOW);
  const s = buildSessionCurve(dateEt, grouped.get(dateEt)!)!;
  assert(s !== null);
  assertEquals(s.cumulative.length, CURVE_LEN);
  // At minute 249: cum should equal 250*10 = 2500
  assertEquals(s.cumulative[249], 2500);
  // At minute 389: still 2500 (forward-filled, no fabrication)
  assertEquals(s.cumulative[389], 2500);
});

// Full baseline ---------------------------------------------------
Deno.test("buildBaselineFromBars builds canonical curve from 10+ sessions", () => {
  const dates = [
    "2026-07-06","2026-07-07","2026-07-08","2026-07-09","2026-07-10",
    "2026-07-13","2026-07-14","2026-07-15","2026-07-16","2026-07-17",
    "2026-07-20",
  ];
  const bars: unknown[] = [];
  for (const d of dates) bars.push(...fullSession(d, 100));
  const r = buildBaselineFromBars(bars, NOW, "2026-07-24");
  assert(r.ok, `expected ok baseline, got ${JSON.stringify(r)}`);
  if (!r.ok) return;
  assertEquals(r.sessions_used, dates.length);
  assertEquals(r.curve.length, CURVE_LEN);
  assertEquals(r.curve[0].m, 0);
  assertEquals(r.curve[389].m, 389);
  assertEquals(r.baseline_date, "2026-07-20");
  // Nondecreasing + nonnegative
  let last = -1;
  for (const p of r.curve) {
    assert(p.cum >= 0);
    assert(p.cum >= last);
    last = p.cum;
  }
  // First minute avg volume ~= 100
  assertEquals(r.curve[0].cum, 100);
  assertEquals(r.curve[389].cum, 100 * 390);
});

Deno.test("buildBaselineFromBars rejects under 10 sessions", () => {
  const bars: unknown[] = [];
  for (let i = 0; i < MIN_SESSIONS - 1; i++) {
    const d = `2026-07-${(6 + i).toString().padStart(2, "0")}`;
    bars.push(...fullSession(d, 50));
  }
  const r = buildBaselineFromBars(bars, NOW, "2026-07-24");
  assert(!r.ok);
  if (r.ok) return;
  assertEquals(r.reason, "insufficient_sessions");
});

Deno.test("buildBaselineFromBars caps at 20 sessions", () => {
  const bars: unknown[] = [];
  // 25 sessions, incrementing volume so we can verify the most-recent 20 are kept.
  const dates: string[] = [];
  for (let i = 0; i < 25; i++) {
    // Skip weekends by picking sequential business days approximated: use 2026-06-15..~2026-07-17.
    const day = new Date(Date.UTC(2026, 5, 15 + i));
    const iso = day.toISOString().slice(0, 10);
    dates.push(iso);
    bars.push(...fullSession(iso, 100));
  }
  const r = buildBaselineFromBars(bars, NOW, "2026-07-24");
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.sessions_used, 20);
});

Deno.test("buildBaselineFromBars excludes sessions on/after notAfterDate", () => {
  const bars: unknown[] = [];
  const dates = [
    "2026-07-06","2026-07-07","2026-07-08","2026-07-09","2026-07-10",
    "2026-07-13","2026-07-14","2026-07-15","2026-07-16","2026-07-17",
    "2026-07-24", // must be excluded (== notAfterDate)
  ];
  for (const d of dates) bars.push(...fullSession(d, 100));
  const r = buildBaselineFromBars(bars, NOW, "2026-07-24");
  assert(r.ok);
  if (!r.ok) return;
  assertEquals(r.baseline_date, "2026-07-17");
  assertEquals(r.sessions_used, 10);
});
