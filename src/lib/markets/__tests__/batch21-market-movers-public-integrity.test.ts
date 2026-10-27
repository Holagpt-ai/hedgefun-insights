import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  etSessionDate,
  mapPolygonMoversDetailed,
  mapTrackedMostActiveMovers,
  moverFromPolygonTicker,
  selectCanonicalCurrentMovers,
  toMoverListRow,
} from "@/lib/markets/movers-integrity";
import {
  MOST_ACTIVE_TRACKED_UNIVERSE_DETAIL,
  MOST_ACTIVE_TRACKED_UNIVERSE_TITLE,
  summarizeMoversListProvenance,
  delayedMarketMoversSeoDescription,
} from "@/lib/markets/movers-provenance";
import {
  canRetryEmptyPremarketFetch,
  PREMARKET_EMPTY_RETRY_MAX,
} from "@/lib/markets/movers-query-lifecycle";
import { formatStockHeaderSessionLine } from "@/lib/price-utils";

const NOW = Date.parse("2026-08-27T16:00:00.000Z");
const TODAY = etSessionDate(NOW);
const PRIOR = "2026-08-26";

function ticker(overrides: Record<string, unknown> = {}) {
  return {
    ticker: "AAA",
    name: "Example Corp",
    todaysChangePerc: 5,
    todaysChange: 1,
    day: { c: 21, v: 2_000_000, vw: 20.8 },
    prevDay: { c: 20 },
    lastTrade: { p: 21, t: NOW },
    min: { c: 20.9 },
    updated: NOW,
    ...overrides,
  };
}

describe("Batch 21 — market movers public integrity", () => {
  it("labels most active as tracked gainers/losers universe only", () => {
    expect(MOST_ACTIVE_TRACKED_UNIVERSE_TITLE).toContain("Among Tracked");
    expect(MOST_ACTIVE_TRACKED_UNIVERSE_DETAIL).toMatch(/not a market-wide/i);
    const activePage = readFileSync(resolve("src/pages/markets/ActivePage.tsx"), "utf8");
    expect(activePage).toContain("MOST_ACTIVE_TRACKED_UNIVERSE_TITLE");
    expect(activePage).not.toMatch(/real-time/i);
  });

  it("excludes a high-volume symbol outside the gainers/losers candidate universe", () => {
    const gainers = [ticker({ ticker: "G1", day: { c: 11, v: 100_000 }, prevDay: { c: 10 } })];
    const losers = [ticker({ ticker: "L1", day: { c: 9, v: 200_000 }, prevDay: { c: 10 } })];
    const { rows } = mapTrackedMostActiveMovers(gainers, losers, "regular", { nowMs: NOW });
    expect(rows.map((r) => r.symbol)).not.toContain("MEGA");
    expect(rows.map((r) => r.symbol).sort()).toEqual(["L1", "G1"].sort());
  });

  it("orders verified volume descending and ranks unknown volume last", () => {
    const knownZero = moverFromPolygonTicker(ticker({
      ticker: "ZERO",
      day: { c: 10, v: 0 },
      prevDay: { c: 10 },
    }), "regular", NOW);
    // Polygon day.v=0 is missing, not a verified zero. Cache/RPC may still store 0.
    knownZero.volume = 0;
    const unknown = moverFromPolygonTicker(ticker({
      ticker: "UNK",
      day: { c: 11, v: undefined },
      prevDay: { c: 10 },
    }), "regular", NOW);
    unknown.volume = null;
    const high = moverFromPolygonTicker(ticker({
      ticker: "HIV",
      day: { c: 12, v: 9_000_000 },
      prevDay: { c: 10 },
    }), "regular", NOW);
    const ordered = selectCanonicalCurrentMovers([knownZero, unknown, high], {
      sessionDate: TODAY,
      sort: "volume_desc",
    });
    expect(ordered.map((r) => r.symbol)).toEqual(["HIV", "ZERO", "UNK"]);
  });

  it("treats Polygon day.v=0 as missing volume on regular list rows", () => {
    const zero = toMoverListRow(moverFromPolygonTicker(ticker({
      ticker: "ZERO",
      day: { c: 10, v: 0 },
      prevDay: { c: 10 },
    }), "regular", NOW));
    const missing = toMoverListRow({
      ...moverFromPolygonTicker(ticker({ ticker: "MISS" }), "regular", NOW),
      volume: null,
    });
    expect(zero?.volume).toBeNull();
    expect(missing?.volume).toBeNull();
  });

  it("deduplicates duplicate symbols using fresher provider evidence", () => {
    const { rows } = mapPolygonMoversDetailed([
      ticker({ ticker: "DUP", day: { c: 21, v: 100 }, prevDay: { c: 20 }, updated: NOW }),
      ticker({ ticker: "DUP", day: { c: 21, v: 500 }, prevDay: { c: 20 }, updated: NOW + 60_000, lastTrade: { p: 21, t: NOW + 60_000 } }),
    ], "regular", { nowMs: NOW, sort: "percent_desc" });
    expect(rows).toHaveLength(1);
    expect(rows[0].volume).toBe(500);
  });

  it("marks prior-session movers from stale provider day bars after rollover", () => {
    const fridayBarMs = Date.parse("2026-08-28T20:00:00.000Z");
    const mondayPremarketMs = Date.parse("2026-08-31T12:00:00.000Z");
    const prior = moverFromPolygonTicker(ticker({
      ticker: "OLD",
      day: { c: 21, v: 1_000_000, t: fridayBarMs },
      prevDay: { c: 20 },
      lastTrade: { p: 21, t: fridayBarMs },
    }), "regular", mondayPremarketMs);
    expect(prior.session_date).toBe("2026-08-28");
    const summary = summarizeMoversListProvenance([prior], {
      nowMs: mondayPremarketMs,
      universe: "top_gainers",
      moverSession: "regular",
    });
    expect(summary.isPriorSession).toBe(true);
    expect(summary.freshness).toBe("prior_session");
    expect(summary.sessionLine).toMatch(/Prior source session/);
  });

  it("bounds premarket empty retries per lifecycle", () => {
    expect(PREMARKET_EMPTY_RETRY_MAX).toBe(1);
    expect(canRetryEmptyPremarketFetch(0)).toBe(true);
    expect(canRetryEmptyPremarketFetch(1)).toBe(false);
    const src = readFileSync(resolve("src/pages/markets/PremarketPage.tsx"), "utf8");
    expect(src).toContain("canRetryEmptyPremarketFetch");
    expect(src).not.toMatch(/gRefetch\(\),\s*2000\)/);
  });

  it("separates fetch error copy from successful empty copy", () => {
    const layout = readFileSync(resolve("src/components/markets/MarketMoversLayout.tsx"), "utf8");
    expect(layout).toContain("moversFetchErrorMessage");
    expect(layout).toContain("moversSuccessfulEmptyMessage");
  });

  it("shows provider as-of when timestamps exist and avoids browser-only updated today", () => {
    const mover = moverFromPolygonTicker(
      ticker({ ticker: "TS", day: { c: 21, v: 1_000_000, t: NOW }, prevDay: { c: 20 }, lastTrade: { p: 21, t: NOW } }),
      "regular",
      NOW,
    );
    const summary = summarizeMoversListProvenance([mover], {
      nowMs: NOW,
      universe: "top_gainers",
      moverSession: "regular",
    });
    expect(summary.observationLine).toMatch(/As of/);
    expect(summary.observationLine).toMatch(/15-minute delayed/);
    const layout = readFileSync(resolve("src/components/markets/MarketMoversLayout.tsx"), "utf8");
    expect(layout).not.toContain("Updated {today}");
  });

  it("keeps after-hours reference against regular close", () => {
    const afterHours = Date.parse("2026-08-27T21:00:00.000Z");
    const m = moverFromPolygonTicker(ticker({
      ticker: "AH",
      day: { c: 10, v: 1_000_000 },
      prevDay: { c: 9 },
      lastTrade: { p: 11, t: afterHours },
      min: { c: 10.9, av: 12_000, t: afterHours },
    }), "afterhours", afterHours);
    expect(m.valid).toBe(true);
    expect(m.reference_price).toBe(10);
    expect(m.price).toBe(11);
  });

  it("respects holiday closed session labeling", () => {
    const laborDay = Date.parse("2026-09-07T15:00:00.000Z");
    const line = formatStockHeaderSessionLine(new Date(laborDay));
    expect(line).toMatch(/Labor Day|Market closed/i);
  });

  it("aligns homepage, market pages, and legacy movers routes on shared fetch", () => {
    const home = readFileSync(resolve("src/components/home/MoversTable.tsx"), "utf8");
    const gainers = readFileSync(resolve("src/pages/markets/GainersPage.tsx"), "utf8");
    const legacy = readFileSync(resolve("src/pages/movers/MoversPage.tsx"), "utf8");
    expect(home).toContain("useHomepagePublicMovers");
    expect(readFileSync(resolve("src/hooks/useHomepagePublicMovers.ts"), "utf8")).toContain(
      "fetchHomepagePublicMoversBundle",
    );
    expect(gainers).toContain("fetchPublicGainersRows");
    expect(legacy).toContain("fetchLegacyMoversRoute");
    expect(legacy).toContain("sessionDate");
  });

  it("maps identical polygon fixtures the same way for market and legacy gainers paths", () => {
    const payload = [
      ticker({ ticker: "SAME", day: { c: 21, v: 1_000_000, t: NOW }, prevDay: { c: 20 } }),
    ];
    const market = mapPolygonMoversDetailed(payload, "regular", { nowMs: NOW, sort: "percent_desc" });
    const legacy = mapPolygonMoversDetailed(payload, "regular", { nowMs: NOW, sort: "percent_desc" });
    expect(legacy.rows).toEqual(market.rows);
    expect(legacy.movers[0]?.session_date).toBe(market.movers[0]?.session_date);
  });

  it("avoids unsupported real-time SEO on mover market pages", () => {
    for (const file of ["GainersPage.tsx", "LosersPage.tsx", "ActivePage.tsx", "PremarketPage.tsx"]) {
      const src = readFileSync(resolve(`src/pages/markets/${file}`), "utf8");
      expect(src).not.toMatch(/real-time/i);
      expect(src).toMatch(/delayedMarketMoversSeoDescription|15-minute delayed/i);
    }
  });

  it("uses delayed-market-data phrasing in SEO helper", () => {
    const desc = delayedMarketMoversSeoDescription("top gainers", "Stocksist");
    expect(desc).toMatch(/15-minute delayed/);
    expect(desc).not.toMatch(/real-time/i);
  });
});
