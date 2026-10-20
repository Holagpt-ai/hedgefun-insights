import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  moverFromPolygonTicker,
  type CanonicalMover,
} from "@/lib/markets/movers-integrity";
import { summarizeMoversListProvenance } from "@/lib/markets/movers-provenance";
import { matchExplicitSymbolHeadline } from "@/lib/markets/market-pulse-news";
import { MARKET_PULSE_DEFAULT_CONFIG } from "@/lib/markets/market-pulse-config";
import { selectMarketPulseItems } from "@/lib/markets/market-pulse-select";
const NOW = Date.parse("2026-08-27T16:00:00.000Z");

function ticker(overrides: Record<string, unknown> = {}) {
  return {
    ticker: "AAA",
    name: "Example Corp",
    todaysChangePerc: 6,
    day: { c: 21, v: 2_000_000, t: NOW },
    prevDay: { c: 20 },
    lastTrade: { p: 21, t: NOW },
    min: { c: 21, t: NOW },
    ...overrides,
  };
}

function provenanceFor(movers: CanonicalMover[]) {
  return summarizeMoversListProvenance(movers, {
    nowMs: NOW,
    universe: "tracked_gainers_losers",
    moverSession: "regular",
  });
}

describe("Batch 22 — market pulse", () => {
  it("prioritizes verified volume when ranking significant moves", () => {
    const highVol = moverFromPolygonTicker(ticker({ ticker: "HIV", todaysChangePerc: 4, day: { c: 21, v: 9_000_000, t: NOW }, prevDay: { c: 20 } }), "regular", NOW);
    const highPct = moverFromPolygonTicker(ticker({ ticker: "HIP", todaysChangePerc: 12, day: { c: 25, v: 50_000, t: NOW }, prevDay: { c: 20 } }), "regular", NOW);
    const items = selectMarketPulseItems({
      gainers: [highPct, highVol],
      losers: [],
      provenance: provenanceFor([highVol, highPct]),
      nowMs: NOW,
    });
    expect(items[0]?.symbol).toBe("HIV");
  });

  it("classifies upward and downward moves", () => {
    const up = moverFromPolygonTicker(ticker({ ticker: "UP", todaysChangePerc: 8 }), "regular", NOW);
    const down = moverFromPolygonTicker(ticker({ ticker: "DN", todaysChangePerc: -9, day: { c: 18, v: 1_000_000, t: NOW }, prevDay: { c: 20 } }), "regular", NOW);
    const items = selectMarketPulseItems({
      gainers: [up],
      losers: [down],
      provenance: provenanceFor([up, down]),
      nowMs: NOW,
    });
    expect(items.find((i) => i.symbol === "UP")?.direction).toBe("up");
    expect(items.find((i) => i.symbol === "DN")?.direction).toBe("down");
  });

  it("respects configurable significance thresholds", () => {
    const weak = moverFromPolygonTicker(ticker({ ticker: "WEAK", todaysChangePerc: 1, day: { c: 20.2, v: 1000, t: NOW }, prevDay: { c: 20 } }), "regular", NOW);
    const items = selectMarketPulseItems({
      gainers: [weak],
      losers: [],
      provenance: provenanceFor([weak]),
      nowMs: NOW,
      config: { ...MARKET_PULSE_DEFAULT_CONFIG, minAbsChangePercent: 3 },
    });
    expect(items).toHaveLength(0);
  });

  it("distinguishes unknown volume from zero volume in output", () => {
    const zero = moverFromPolygonTicker(ticker({ ticker: "ZERO", todaysChangePerc: 10, day: { c: 22, v: 0, t: NOW }, prevDay: { c: 20 } }), "regular", NOW);
    const missing = moverFromPolygonTicker(ticker({ ticker: "MISS", todaysChangePerc: 10, day: { c: 22, t: NOW }, prevDay: { c: 20 }, lastTrade: { p: 22, t: NOW } }), "regular", NOW);
    missing.volume = null;
    const items = selectMarketPulseItems({
      gainers: [zero, missing],
      losers: [],
      provenance: provenanceFor([zero, missing]),
      nowMs: NOW,
    });
    const zeroRow = items.find((i) => i.symbol === "ZERO");
    const missRow = items.find((i) => i.symbol === "MISS");
    expect(zeroRow?.volume).toBeNull();
    expect(missRow?.volume).toBeNull();
  });

  it("never fabricates AI explanation text", () => {
    const up = moverFromPolygonTicker(ticker({ ticker: "AI", todaysChangePerc: 9 }), "regular", NOW);
    const items = selectMarketPulseItems({
      gainers: [up],
      losers: [],
      provenance: provenanceFor([up]),
      nowMs: NOW,
    });
    expect(items[0]?.aiExplanationText).toBeNull();
    expect(items[0]?.aiVerificationState).toBe("disabled");
    expect(items[0]?.movementContext).toBe("verified_movement_unexplained");
  });

  it("deduplicates the same ticker event identity", () => {
    const a = moverFromPolygonTicker(ticker({ ticker: "DUP" }), "regular", NOW);
    const b = moverFromPolygonTicker(ticker({ ticker: "DUP", day: { c: 21.5, v: 3_000_000, t: NOW + 1000 }, prevDay: { c: 20 }, lastTrade: { p: 21.5, t: NOW + 1000 } }), "regular", NOW);
    const items = selectMarketPulseItems({
      gainers: [a, b],
      losers: [],
      provenance: provenanceFor([a, b]),
      nowMs: NOW,
    });
    expect(items.filter((i) => i.symbol === "DUP")).toHaveLength(1);
  });

  it("matches headlines only with explicit related symbol metadata", () => {
    const matched = matchExplicitSymbolHeadline("AAPL", [
      {
        id: "1",
        headline: "Apple announces dividend",
        url: "https://example.com/aapl",
        published_at: "2026-08-27T12:00:00.000Z",
        related: ["AAPL"],
        source: "Reuters",
      },
    ]);
    expect(matched?.label).toBe("Related headline");
    const inferred = matchExplicitSymbolHeadline("AAPL", [
      {
        id: "2",
        headline: "AAPL shares rise on earnings",
        url: "https://example.com/2",
        published_at: "2026-08-27T12:00:00.000Z",
        source: "Reuters",
      },
    ]);
    expect(inferred).toBeNull();
  });

  it("labels prior-session provenance without implying live freshness", () => {
    const friday = Date.parse("2026-08-28T20:00:00.000Z");
    const monday = Date.parse("2026-08-31T12:00:00.000Z");
    const prior = moverFromPolygonTicker(ticker({
      ticker: "OLD",
      day: { c: 21, v: 2_000_000, t: friday },
      prevDay: { c: 20 },
      lastTrade: { p: 21, t: friday },
    }), "regular", monday);
    const prov = summarizeMoversListProvenance([prior], {
      nowMs: monday,
      universe: "top_gainers",
      moverSession: "regular",
    });
    const items = selectMarketPulseItems({
      gainers: [prior],
      losers: [],
      provenance: prov,
      nowMs: monday,
    });
    expect(items[0]?.sessionEvidence).toBe("prior_session_historical");
  });

  it("wires Market Pulse into the homepage after market clocks", () => {
    const index = readFileSync(resolve("src/pages/Index.tsx"), "utf8");
    const pulse = readFileSync(resolve("src/components/home/MarketPulse.tsx"), "utf8");
    expect(index).toContain("<MarketPulse />");
    expect(index.indexOf("GlobalMarketClocks")).toBeLessThan(index.indexOf("<MarketPulse />"));
    expect(pulse).toContain("Significant Market Moves");
    expect(pulse).toContain("flex flex-col gap-2");
    expect(pulse).toContain("stockDetailPath");
  });

  it("shares homepage movers query infrastructure without empty-result retry loops", () => {
    const hook = readFileSync(resolve("src/hooks/useHomepagePublicMovers.ts"), "utf8");
    expect(hook).toContain("homepagePublicMoversQueryKey");
    expect(hook).not.toMatch(/useEffect[\s\S]*refetch/);
  });
});
