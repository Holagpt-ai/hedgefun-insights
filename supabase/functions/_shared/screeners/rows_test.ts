// Write-side row mapping: persisted volumes and the ratio derived from them.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { mapTabRows } from "./rows.ts";
import type { GenerationMeta } from "./rows.ts";
import {
  type PolygonTicker,
  selectForTab,
  volumeRatioPriorSession,
} from "./selection.ts";
// The invariant the Screener UI enforces on every stored row.
import { expectedVolumeRatio } from "../../../../src/lib/screeners/contract.ts";

const FIXED_ISO = "2026-07-27T20:00:00.000Z";
const FIXED_MS = Date.parse(FIXED_ISO);
const FIXED_NS = FIXED_MS * 1_000_000;
const RUN_ID = "11111111-2222-3333-4444-555555555555";

const META: GenerationMeta = {
  syncedAt: FIXED_ISO,
  syncRunId: RUN_ID,
  nowMs: FIXED_MS,
};

const getName = (symbol: string) => `${symbol} Inc.`;

function ticker(partial: {
  ticker: string;
  volume: number;
  prevVol?: number | null;
  price?: number;
  change?: number;
}): PolygonTicker {
  const price = partial.price ?? 10;
  const prevDay: { c: number; v?: number } = { c: price * 0.9 };
  if (partial.prevVol !== null && partial.prevVol !== undefined) {
    prevDay.v = partial.prevVol;
  }
  return {
    ticker: partial.ticker,
    updated: FIXED_NS,
    todaysChangePerc: partial.change ?? 15,
    day: {
      c: price,
      o: price,
      v: partial.volume,
      h: price * 1.05,
      l: price * 0.95,
    },
    prevDay,
    lastTrade: { p: price },
  };
}

/** Every stored row must satisfy the frontend consistency check. */
function assertFrontendRatioInvariant(
  rows: ReturnType<typeof mapTabRows>,
): void {
  for (const row of rows) {
    const prior = row.prior_session_volume;
    const ratio = row.volume_ratio_prior_session;
    assertEquals(prior === null, ratio === null);
    if (prior === null || ratio === null) continue;
    assertEquals(expectedVolumeRatio(row.volume as number, prior), ratio);
  }
}

// ── Regression: ratio must come from the persisted volumes ────────────────

// Raw provider volumes land just under a .x5 ratio boundary while the
// rounded volumes that actually get stored land exactly on it, so the raw
// ratio (5.4) and the persisted-volume ratio (5.5) differ by 0.1.
const FRACTIONAL_VOLUME = 5_449_999.6;
const FRACTIONAL_PRIOR = 1_000_000.4;

Deno.test("rows: fractional provider volumes still yield a ratio consistent with the persisted volumes", () => {
  const t = ticker({
    ticker: "FRAC",
    volume: FRACTIONAL_VOLUME,
    prevVol: FRACTIONAL_PRIOR,
  });

  // The raw-volume metric disagrees with the rounded volumes by 0.1 — this is
  // exactly the mismatch that failed the frontend consistency check.
  assertEquals(volumeRatioPriorSession(t), 5.4);

  const [row] = mapTabRows("unusual_volume", [t], getName, META);

  assertEquals(row.volume, 5_450_000);
  assertEquals(row.prior_session_volume, 1_000_000);
  assertEquals(row.volume_ratio_prior_session, 5.5);
  assertEquals(
    expectedVolumeRatio(row.volume as number, row.prior_session_volume as number),
    row.volume_ratio_prior_session,
  );
  assertFrontendRatioInvariant([row]);
});

// ── Existing behavior ─────────────────────────────────────────────────────

Deno.test("rows: ordinary volume values keep their one-decimal ratio", () => {
  const t = ticker({
    ticker: "ORD",
    volume: 12_345_678,
    prevVol: 1_000_000,
  });

  const [row] = mapTabRows("unusual_volume", [t], getName, META);

  assertEquals(row.volume, 12_345_678);
  assertEquals(row.prior_session_volume, 1_000_000);
  assertEquals(row.volume_ratio_prior_session, 12.3);
  assertFrontendRatioInvariant([row]);
});

Deno.test("rows: missing prior-session volume leaves prior and ratio null", () => {
  const t = ticker({ ticker: "NOPRIOR", volume: 4_000_000, prevVol: null });

  const [row] = mapTabRows("gainers_losers", [t], getName, META);

  assertEquals(row.volume, 4_000_000);
  assertEquals(row.prior_session_volume, null);
  assertEquals(row.volume_ratio_prior_session, null);
  assertFrontendRatioInvariant([row]);
});

Deno.test("rows: zero prior-session volume leaves prior and ratio null", () => {
  const t = ticker({ ticker: "ZERO", volume: 4_000_000, prevVol: 0 });

  const [row] = mapTabRows("gainers_losers", [t], getName, META);

  assertEquals(row.volume, 4_000_000);
  assertEquals(row.prior_session_volume, null);
  assertEquals(row.volume_ratio_prior_session, null);
  assertFrontendRatioInvariant([row]);
});

Deno.test("rows: volume-first ordering survives mapping", () => {
  const universe = [
    ticker({ ticker: "LOW", volume: 3_100_000, prevVol: 1_000_000 }),
    ticker({ ticker: "TOP", volume: 9_400_000, prevVol: 1_000_000 }),
    ticker({ ticker: "BBB", volume: 6_200_000, prevVol: 1_000_000 }),
    ticker({ ticker: "AAA", volume: 6_200_000, prevVol: 1_000_000 }),
    ticker({
      ticker: "FRAC",
      volume: FRACTIONAL_VOLUME,
      prevVol: FRACTIONAL_PRIOR,
    }),
  ];

  const rows = mapTabRows(
    "volume_spikes",
    selectForTab("volume_spikes", universe),
    getName,
    META,
  );

  assertEquals(rows.map((r) => r.symbol), [
    "TOP",
    "AAA",
    "BBB",
    "FRAC",
    "LOW",
  ]);
  assertFrontendRatioInvariant(rows);
});
