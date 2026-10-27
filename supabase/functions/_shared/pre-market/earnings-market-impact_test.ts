import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  rankEarningsByMarketImpact,
  scoreEarningsMarketImpact,
} from "./earnings-market-impact.ts";

const ET = "2026-10-27";

function earnRow(
  symbol: string,
  facts: Record<string, unknown> = {},
  time_of_day: string | null = "before_open",
) {
  return {
    symbol,
    provider: "earnings_calendar",
    verification_state: "provider_reported",
    event_type: "earnings",
    event_date: ET,
    time_of_day,
    updated_at: "2026-10-27T08:00:00Z",
    published_at: null,
    facts,
  };
}

Deno.test("Batch 187 — SOFI ranks above alphabetical AB with verified surprise and activity", () => {
  const metadata = new Map([
    ["SOFI", { market_cap: 8_000_000_000, volume: 12_000_000, rvol_20d: 2.2, change_percent: 4.5, price: 8 }],
    ["AB", { market_cap: 200_000_000, volume: 50_000, rvol_20d: 0.4, change_percent: 0.2, price: 30 }],
    ["ABG", { market_cap: 3_000_000_000, volume: 120_000, rvol_20d: 0.6, change_percent: -0.5, price: 220 }],
  ]);
  const rows = [
    earnRow("AB", {}),
    earnRow("ABG", {}),
    earnRow("SOFI", { actual_eps: 0.08, estimate_eps: 0.05, surprise_percent: 60 }),
  ];
  const ranked = rankEarningsByMarketImpact(rows, { owned: new Set(), metadataBySymbol: metadata });
  assertEquals(ranked[0]?.row.symbol, "SOFI");
  assertEquals(ranked.some((r) => r.row.symbol === "AB"), true);
  assertEquals(ranked[0]?.score.priorityReason, "Earnings surprise");
});

Deno.test("Batch 187 — large-cap significance can outrank quiet small-cap without activity", () => {
  const metadata = new Map([
    ["AAPL", { market_cap: 3_000_000_000_000, volume: 4_000_000, rvol_20d: 0.9, change_percent: 0.3, price: 180 }],
    ["ACU", { market_cap: 40_000_000, volume: 8_000, rvol_20d: 0.2, change_percent: 0.1, price: 40 }],
  ]);
  const ranked = rankEarningsByMarketImpact(
    [earnRow("ACU"), earnRow("AAPL")],
    { owned: new Set(), metadataBySymbol: metadata },
  );
  assertEquals(ranked[0]?.row.symbol, "AAPL");
});

Deno.test("Batch 187 — high-activity small-cap can rank above quiet large-cap", () => {
  const metadata = new Map([
    ["MEGA", { market_cap: 80_000_000_000, volume: 500_000, rvol_20d: 0.5, change_percent: 0.1, price: 400 }],
    ["HOT", { market_cap: 900_000_000, volume: 18_000_000, rvol_20d: 4.5, change_percent: 12, price: 22 }],
  ]);
  const ranked = rankEarningsByMarketImpact(
    [earnRow("MEGA"), earnRow("HOT")],
    { owned: new Set(), metadataBySymbol: metadata },
  );
  assertEquals(ranked[0]?.row.symbol, "HOT");
  assertEquals(ranked[0]?.score.priorityReason, "High trading activity");
});

Deno.test("Batch 187 — missing metadata does not invent scores", () => {
  const score = scoreEarningsMarketImpact(earnRow("XYZ"), {
    onWatchlist: false,
    metadata: null,
  });
  assertEquals(score.surprise, 0);
  assertEquals(score.significance, 0);
  assertEquals(score.activity, 0);
});
