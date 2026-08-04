import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ALGORITHM_ID,
  type ClassifyResult,
  classifyWeeklyCandidate,
  MAX_ALLOWED_WEEKLY_GAP_MS,
  MIN_WEEKLY_BARS,
  WEEK_MS,
  type WeeklyBar,
} from "./classify.ts";

const T0 = Date.parse("2020-01-03T00:00:00.000Z");

/** Build N ascending weekly bars from a close series. */
function fromCloses(
  closes: number[],
  opts: {
    volumes?: number[];
    highs?: Array<number | undefined>;
    lows?: Array<number | undefined>;
    gapAt?: { index: number; gapMs: number };
  } = {},
): WeeklyBar[] {
  let t = T0;
  const out: WeeklyBar[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (opts.gapAt && i === opts.gapAt.index) {
      t += opts.gapAt.gapMs;
    } else if (i > 0) {
      t += WEEK_MS;
    }
    const c = closes[i]!;
    const o = c;
    const h = opts.highs?.[i] ?? Math.max(o, c) * 1.01;
    const l = opts.lows?.[i] ?? Math.min(o, c) * 0.99;
    out.push({
      t,
      o,
      h,
      l,
      c,
      v: opts.volumes?.[i] ?? 1_000_000,
    });
  }
  return out;
}

function linearCloses(
  n: number,
  start: number,
  end: number,
): number[] {
  if (n === 1) return [end];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    out.push(start + ((end - start) * i) / (n - 1));
  }
  return out;
}

function constantCloses(n: number, value: number): number[] {
  return Array.from({ length: n }, () => value);
}

function snapshot(bars: WeeklyBar[]): WeeklyBar[] {
  return bars.map((b) => ({ ...b }));
}

function assertNoForbiddenFields(result: ClassifyResult): void {
  const text = JSON.stringify(result);
  const forbidden = [
    "score",
    "confidence",
    "rank",
    "tier",
    "probability",
    "recommendation",
  ];
  for (const term of forbidden) {
    assert(
      !new RegExp(`"${term}"\\s*:`, "i").test(text),
      `forbidden field present: ${term}`,
    );
  }
}

// ── Stage fixtures ─────────────────────────────────────────────────────────

Deno.test("stage 1 fixture: flat MA and mid-range position", () => {
  // Flat series: SMA slope ~0, price equals SMA, range mid.
  const closes = constantCloses(40, 100);
  // Give the prior 26-bar window a real range via highs/lows; keep closes flat.
  const highs = closes.map(() => 110);
  const lows = closes.map(() => 90);
  // Current bar inside mid-range: close 100 → range = (100-90)/(110-90) = 0.50
  highs[39] = 101;
  lows[39] = 99;
  const bars = fromCloses(closes, { highs, lows });
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "ok");
  assertEquals(r.candidateStage, "stage_1");
  assertEquals(r.algorithmId, ALGORITHM_ID);
  assert(r.reasonCodes.includes("stage_1"));
  assert(r.reasonCodes.includes("flat_ma"));
  assertEquals(r.metrics.rangePosition !== null, true);
  assert(r.metrics.rangePosition! >= 0.20 && r.metrics.rangePosition! <= 0.80);
});

Deno.test("stage 2 fixture: above rising SMA30", () => {
  const closes = linearCloses(40, 50, 150);
  const bars = fromCloses(closes);
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "ok");
  assertEquals(r.candidateStage, "stage_2");
  assertEquals(r.metrics.aboveSma30, true);
  assert(r.metrics.slopePct10! >= 0.02);
  assert(r.reasonCodes.includes("stage_2"));
  assert(r.reasonCodes.includes("rising_ma"));
});

Deno.test("stage 3 fixture: above SMA and falling", () => {
  // Early highs lift SMA30_t_minus_10; later closes fall so slope is negative,
  // while a final spike keeps the current close above SMA30_t.
  const closes = [
    ...constantCloses(10, 200),
    ...constantCloses(29, 100),
    130,
  ];
  const bars = fromCloses(closes);
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "ok");
  assertEquals(r.candidateStage, "stage_3");
  assertEquals(r.metrics.aboveSma30, true);
  assert(r.metrics.slopePct10! <= -0.02);
  assert(r.reasonCodes.includes("stage_3"));
});

Deno.test("stage 4 fixture: below falling SMA30", () => {
  const closes = linearCloses(40, 150, 50);
  const bars = fromCloses(closes);
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "ok");
  assertEquals(r.candidateStage, "stage_4");
  assertEquals(r.metrics.belowSma30, true);
  assert(r.metrics.slopePct10! <= -0.02);
  assert(r.reasonCodes.includes("stage_4"));
});

Deno.test("unclassified fixture: below SMA with rising slope", () => {
  // Early lows keep SMA30_t_minus_10 depressed so slope rises, while the
  // current close stays below SMA30_t.
  const closes = [
    ...constantCloses(10, 50),
    ...constantCloses(29, 100),
    95,
  ];
  const bars = fromCloses(closes);
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "ok");
  assertEquals(r.candidateStage, "unclassified");
  assertEquals(r.metrics.belowSma30, true);
  assert(r.metrics.slopePct10! >= 0.02);
  assert(r.reasonCodes.includes("unclassified"));
});

// ── Validation / insufficient data ─────────────────────────────────────────

Deno.test("exactly 40 valid bars is sufficient for classification", () => {
  const bars = fromCloses(linearCloses(40, 50, 150));
  assertEquals(bars.length, MIN_WEEKLY_BARS);
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "ok");
  assertEquals(r.candidateStage, "stage_2");
});

Deno.test("fewer than 40 bars returns insufficient_data", () => {
  const bars = fromCloses(linearCloses(39, 50, 150));
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "insufficient_data");
  assertEquals(r.candidateStage, null);
  assertEquals(r.reasonCodes, ["too_few_bars"]);
});

Deno.test("excessive weekly gap in latest 40 returns insufficient_data", () => {
  const closes = linearCloses(40, 50, 150);
  // Gap > 3 weeks between bar 20 and 21 inside the window.
  const bars = fromCloses(closes, {
    gapAt: { index: 21, gapMs: MAX_ALLOWED_WEEKLY_GAP_MS + 1 },
  });
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "insufficient_data");
  assertEquals(r.candidateStage, null);
  assertEquals(r.reasonCodes, ["excessive_weekly_gap"]);
});

Deno.test("unordered timestamps return invalid_input", () => {
  const bars = fromCloses(constantCloses(40, 100));
  // Swap timestamps of two bars without reordering array.
  const tmp = bars[10]!.t;
  bars[10]!.t = bars[11]!.t;
  bars[11]!.t = tmp;
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "invalid_input");
  assertEquals(r.candidateStage, null);
  assertEquals(r.reasonCodes, ["non_ascending_timestamps"]);
});

Deno.test("duplicate timestamps return invalid_input", () => {
  const bars = fromCloses(constantCloses(40, 100));
  bars[15]!.t = bars[14]!.t;
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "invalid_input");
  assertEquals(r.candidateStage, null);
  assertEquals(r.reasonCodes, ["duplicate_timestamps"]);
});

Deno.test("nonfinite values return invalid_input", () => {
  const bars = fromCloses(constantCloses(40, 100));
  bars[5]!.c = Number.NaN;
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "invalid_input");
  assertEquals(r.candidateStage, null);
  assertEquals(r.reasonCodes, ["nonfinite_values"]);
});

Deno.test("invalid OHLC relationships return invalid_input", () => {
  const bars = fromCloses(constantCloses(40, 100));
  bars[8]!.l = 120;
  bars[8]!.h = 90;
  bars[8]!.o = 100;
  bars[8]!.c = 100;
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "invalid_input");
  assertEquals(r.candidateStage, null);
  assertEquals(r.reasonCodes, ["invalid_ohlc"]);
});

Deno.test("negative volume returns invalid_input", () => {
  const bars = fromCloses(constantCloses(40, 100));
  bars[3]!.v = -1;
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "invalid_input");
  assertEquals(r.candidateStage, null);
  assertEquals(r.reasonCodes, ["negative_volume"]);
});

Deno.test("zero-width range yields null rangePosition", () => {
  const closes = constantCloses(40, 100);
  // Force prior 26 highs/lows equal to close (zero width), current equal too.
  const highs = closes.map(() => 100);
  const lows = closes.map(() => 100);
  const bars = fromCloses(closes, { highs, lows });
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "ok");
  assertEquals(r.metrics.rangePosition, null);
  assertEquals(r.metrics.rangeHigh26, r.metrics.rangeLow26);
  assert(r.reasonCodes.includes("zero_width_range"));
  // Flat + null range → unclassified (Stage 1 requires rangePosition).
  assertEquals(r.candidateStage, "unclassified");
});

Deno.test("zero prior average volume: volumeRatio null, volumeConfirmed false", () => {
  const closes = linearCloses(40, 50, 150);
  const volumes = Array.from({ length: 40 }, () => 0);
  volumes[39] = 5_000_000; // current volume ignored for average
  const bars = fromCloses(closes, { volumes });
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "ok");
  assertEquals(r.metrics.averageVolume10, 0);
  assertEquals(r.metrics.volumeRatio, null);
  assertEquals(r.metrics.volumeConfirmed, false);
});

// ── Threshold boundaries ───────────────────────────────────────────────────

Deno.test("rising threshold exactly 0.02 is rising / Stage 2 when above", () => {
  // SMA30_t_minus_10 = mean(closes[0..29]) = 100
  // SMA30_t = mean(closes[10..39]) = 102 → slope = 0.02
  // closes[10..29] are 100 (20 bars), so closes[30..39] must be 106:
  // (20*100 + 10*106) / 30 = 102
  const closes = [...constantCloses(30, 100), ...constantCloses(10, 106)];
  assertEquals(closes.length, 40);
  const bars = fromCloses(closes);
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.metrics.slopePct10, 0.02);
  assertEquals(r.metrics.aboveSma30, true);
  assertEquals(r.candidateStage, "stage_2");
  assert(r.reasonCodes.includes("rising_ma"));
});

Deno.test("falling threshold exactly -0.02 is falling / Stage 4 when below", () => {
  // SMA30_t_minus_10 = 100, SMA30_t = 98 → slope = -0.02
  // closes[0..29] = 100
  // closes[10..29] = 100 (20 bars), closes[30..39] = x
  // (2000 + 10x)/30 = 98 → 2000 + 10x = 2940 → x = 94
  const head = constantCloses(30, 100);
  const tail = constantCloses(10, 94);
  const closes = [...head, ...tail];
  const bars = fromCloses(closes);
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.metrics.slopePct10, -0.02);
  assertEquals(r.metrics.belowSma30, true);
  assertEquals(r.candidateStage, "stage_4");
  assert(r.reasonCodes.includes("falling_ma"));
});

Deno.test("range-position boundary 0.20 qualifies Stage 1 when flat", () => {
  const closes = constantCloses(40, 100);
  const highs = closes.map(() => 120);
  const lows = closes.map(() => 80);
  // rangePos = (100-80)/(120-80) = 0.50 by default; force current via lows/highs
  // Want (c - low) / (high - low) = 0.20 → c = low + 0.20*(high-low)
  // Keep prior window 80..120; set current close to 88.
  closes[39] = 88;
  highs[39] = 89;
  lows[39] = 87;
  const bars = fromCloses(closes, { highs, lows });
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.metrics.rangePosition, 0.2);
  assertEquals(r.candidateStage, "stage_1");
});

Deno.test("range-position boundary 0.70 with above+flat is Stage 3", () => {
  const closes = constantCloses(40, 100);
  // Lift current close slightly above SMA while keeping slope flat (~0).
  // Prior range 80..120; want rangePos = 0.70 → close = 80 + 0.7*40 = 108
  // But then SMA30 shifts. Use many bars at 100, nudge only recent closes carefully.
  const highs = closes.map(() => 120);
  const lows = closes.map(() => 80);
  // Set all closes to values that keep SMA slope ~0 and last close above SMA.
  for (let i = 0; i < 40; i++) closes[i] = 100;
  closes[39] = 108;
  highs[39] = 109;
  lows[39] = 107;
  const bars = fromCloses(closes, { highs, lows });
  const r = classifyWeeklyCandidate(bars);
  // slope: SMA30_t uses 29*100+108=3008/30=100.266..., SMA ago uses 100 → small rise
  // May be flat (< 0.02). above should be true.
  assertEquals(r.metrics.aboveSma30, true);
  assertEquals(r.metrics.rangePosition, 0.7);
  assert(
    Math.abs(r.metrics.slopePct10!) < 0.02,
    `expected flat slope, got ${r.metrics.slopePct10}`,
  );
  assertEquals(r.candidateStage, "stage_3");
});

Deno.test("range-position boundary 0.80 qualifies Stage 1 when flat and not Stage 3", () => {
  // Stage 3 needs above+flat+>=0.70 OR above+falling.
  // Use equal-to-SMA (neither above nor below) with rangePos 0.80 → Stage 1.
  const closes = constantCloses(40, 100);
  const highs = closes.map(() => 120);
  const lows = closes.map(() => 80);
  // rangePos 0.80 → close = 80 + 32 = 112, but that would be above SMA.
  // Instead shrink the prior window around a close that equals SMA30=100:
  // Want (100 - low)/(high - low) = 0.80 → 100 - low = 0.8 high - 0.8 low
  // 100 - 0.2 low = 0.8 high. Choose high=105, then 100 - 0.2 low = 84 → 0.2 low = 16 → low=80
  // (100-80)/(105-80)=20/25=0.80. Good. Current close 100 equals SMA.
  for (let i = 0; i < 39; i++) {
    highs[i] = 105;
    lows[i] = 80;
  }
  highs[39] = 101;
  lows[39] = 99;
  const bars = fromCloses(closes, { highs, lows });
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.metrics.rangePosition, 0.8);
  assertEquals(r.metrics.aboveSma30, false);
  assertEquals(r.metrics.belowSma30, false);
  assertEquals(r.candidateStage, "stage_1");
});

Deno.test("volume-confirmation boundary exactly 1.20", () => {
  const closes = linearCloses(40, 50, 150);
  const volumes = Array.from({ length: 40 }, () => 1_000_000);
  // prior 10 volumes at index 29..38 = 1_000_000 → avg 1e6
  volumes[39] = 1_200_000;
  const bars = fromCloses(closes, { volumes });
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.metrics.volumeRatio, 1.2);
  assertEquals(r.metrics.volumeConfirmed, true);
  assert(r.reasonCodes.includes("volume_confirmed"));
});

Deno.test("breakout evidence when close > rangeHigh26", () => {
  const closes = constantCloses(40, 100);
  const highs = closes.map(() => 105);
  const lows = closes.map(() => 95);
  closes[39] = 110;
  highs[39] = 111;
  lows[39] = 109;
  const bars = fromCloses(closes, { highs, lows });
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.metrics.breakout26, true);
  assertEquals(r.metrics.rangeHigh26, 105);
  assert(r.reasonCodes.includes("breakout_26"));
});

Deno.test("breakdown evidence when close < rangeLow26", () => {
  const closes = constantCloses(40, 100);
  const highs = closes.map(() => 105);
  const lows = closes.map(() => 95);
  closes[39] = 90;
  highs[39] = 91;
  lows[39] = 89;
  const bars = fromCloses(closes, { highs, lows });
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.metrics.breakdown26, true);
  assertEquals(r.metrics.rangeLow26, 95);
  assert(r.reasonCodes.includes("breakdown_26"));
});

Deno.test("Stage 3 precedence over Stage 1 when both range conditions match", () => {
  // above + flat + rangePosition in [0.70, 0.80] matches Stage 3 and Stage 1.
  const closes = constantCloses(40, 100);
  const highs = closes.map(() => 120);
  const lows = closes.map(() => 80);
  closes[39] = 108; // rangePos = (108-80)/(120-80) = 0.70
  highs[39] = 109;
  lows[39] = 107;
  const bars = fromCloses(closes, { highs, lows });
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.metrics.aboveSma30, true);
  assertEquals(r.metrics.rangePosition, 0.7);
  assert(Math.abs(r.metrics.slopePct10!) < 0.02);
  assertEquals(r.candidateStage, "stage_3");
  assert(r.reasonCodes.includes("stage_3"));
  assert(!r.reasonCodes.includes("stage_1"));
});

Deno.test("output contains no score, confidence, rank, tier, probability, or recommendation fields", () => {
  const bars = fromCloses(linearCloses(40, 50, 150));
  const r = classifyWeeklyCandidate(bars);
  assertNoForbiddenFields(r);
  assertEquals(
    Object.keys(r.metrics).sort(),
    [
      "aboveSma30",
      "averageVolume10",
      "belowSma30",
      "breakdown26",
      "breakout26",
      "rangeHigh26",
      "rangeLow26",
      "rangePosition",
      "slopePct10",
      "sma30",
      "sma30TenWeeksAgo",
      "volumeConfirmed",
      "volumeRatio",
    ],
  );
});

Deno.test("repeated calls with identical input return deeply identical output", () => {
  const bars = fromCloses(linearCloses(40, 50, 150));
  const a = classifyWeeklyCandidate(bars);
  const b = classifyWeeklyCandidate(bars);
  assertEquals(a, b);
  assertEquals(JSON.stringify(a), JSON.stringify(b));
});

Deno.test("input bars are not mutated", () => {
  const bars = fromCloses(linearCloses(40, 50, 150));
  const before = snapshot(bars);
  const firstRef = bars[0];
  classifyWeeklyCandidate(bars);
  assertEquals(bars, before);
  assertEquals(bars.length, before.length);
  for (let i = 0; i < bars.length; i++) {
    assertEquals(bars[i], before[i]);
  }
  // Same element object identities are preserved (no repair/rebuild).
  assertEquals(bars[0], firstRef);
});

Deno.test("gap of exactly three weeks (two missing) is allowed", () => {
  const closes = linearCloses(40, 50, 150);
  const bars = fromCloses(closes, {
    gapAt: { index: 21, gapMs: MAX_ALLOWED_WEEKLY_GAP_MS },
  });
  const r = classifyWeeklyCandidate(bars);
  assertEquals(r.status, "ok");
  assertEquals(r.candidateStage, "stage_2");
});

Deno.test("algorithm id is mss.weinstein.v1", () => {
  const r = classifyWeeklyCandidate(fromCloses(constantCloses(40, 100)));
  assertEquals(r.algorithmId, "mss.weinstein.v1");
});
