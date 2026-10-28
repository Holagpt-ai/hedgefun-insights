import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  rankEarningsByMarketImpact,
  scoreEarningsMarketImpact,
  scoreEarningsSurprisePoints,
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

function meta(
  partial: Partial<import("./earnings-market-impact.ts").EarningsSymbolMarketMetadata>,
): import("./earnings-market-impact.ts").EarningsSymbolMarketMetadata {
  return {
    market_cap: null,
    volume: null,
    rvol_20d: null,
    change_percent: null,
    price: null,
    activity_verified: false,
    activity_as_of: null,
    activity_tab_id: null,
    ...partial,
  };
}

Deno.test("Batch 187 — SOFI ranks above alphabetical AB with verified surprise and activity", () => {
  const metadata = new Map([
    ["SOFI", meta({
      market_cap: 8_000_000_000,
      volume: 12_000_000,
      rvol_20d: 2.2,
      change_percent: 4.5,
      price: 8,
      activity_verified: true,
      activity_tab_id: "volume_spikes",
      activity_as_of: "2026-10-27T12:50:00.000Z",
    })],
    ["AB", meta({ market_cap: 200_000_000 })],
    ["ABG", meta({ market_cap: 3_000_000_000 })],
  ]);
  const rows = [
    earnRow("AB", {}),
    earnRow("ABG", {}),
    earnRow("SOFI", { actual_eps: 0.08, estimate_eps: 0.05, surprise_percent: 60 }),
  ];
  const ranked = rankEarningsByMarketImpact(rows, { owned: new Set(), metadataBySymbol: metadata });
  assertEquals(ranked[0]?.row.symbol, "SOFI");
  assertEquals(ranked[0]?.score.priorityReason, "Earnings surprise");
});

Deno.test("Batch 187.1 — minor surprise loses to consequential large-cap", () => {
  const minor = scoreEarningsMarketImpact(
    earnRow("SMALL", { surprise_percent: 1.5 }),
    { onWatchlist: false, metadata: meta({ market_cap: 500_000_000 }) },
  );
  const mega = scoreEarningsMarketImpact(
    earnRow("MEGA"),
    { onWatchlist: false, metadata: meta({ market_cap: 80_000_000_000 }) },
  );
  assertEquals(mega.total > minor.total, true);
  assertEquals(mega.priorityReason, "Large-cap report");
});

Deno.test("Batch 187.1 — substantial surprise beats quiet large-cap", () => {
  const surprise = scoreEarningsMarketImpact(
    earnRow("SOFI", { surprise_percent: 45, actual_eps: 0.1, estimate_eps: 0.07 }),
    { onWatchlist: false, metadata: meta({ market_cap: 8_000_000_000 }) },
  );
  const mega = scoreEarningsMarketImpact(
    earnRow("MEGA"),
    { onWatchlist: false, metadata: meta({ market_cap: 80_000_000_000 }) },
  );
  assertEquals(surprise.total > mega.total, true);
});

Deno.test("Batch 187.1 — verified high-activity small-cap ranks strongly", () => {
  const metadata = new Map([
    ["HOT", meta({
      market_cap: 900_000_000,
      volume: 18_000_000,
      rvol_20d: 4.5,
      change_percent: 12,
      price: 22,
      activity_verified: true,
      activity_tab_id: "unusual_volume",
      activity_as_of: "2026-10-27T12:50:00.000Z",
    })],
    ["MEGA", meta({ market_cap: 3_000_000_000 })],
  ]);
  const ranked = rankEarningsByMarketImpact(
    [earnRow("MEGA"), earnRow("HOT")],
    { owned: new Set(), metadataBySymbol: metadata },
  );
  assertEquals(ranked[0]?.row.symbol, "HOT");
});

Deno.test("Batch 187.1 — missing metrics stay at zero surprise points", () => {
  assertEquals(scoreEarningsSurprisePoints({
    estimate_eps: null,
    actual_eps: null,
    surprise_percent: null,
  }), 0);
});

Deno.test("Batch 187 — large-cap significance can outrank quiet small-cap without activity", () => {
  const metadata = new Map([
    ["AAPL", meta({ market_cap: 3_000_000_000_000 })],
    ["ACU", meta({ market_cap: 40_000_000 })],
  ]);
  const ranked = rankEarningsByMarketImpact(
    [earnRow("ACU"), earnRow("AAPL")],
    { owned: new Set(), metadataBySymbol: metadata },
  );
  assertEquals(ranked[0]?.row.symbol, "AAPL");
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
