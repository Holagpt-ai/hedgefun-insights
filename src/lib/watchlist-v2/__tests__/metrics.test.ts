import { describe, it, expect } from "vitest";
import {
  densityTokens,
  parseDensity,
  sortRows,
  rowMatchesFilter,
  computeSummaryMetrics,
} from "@/lib/watchlist-v2/metrics";
import type { V2Row } from "@/hooks/useWatchlistV2";
import { parseKeyLevels } from "@/lib/watchlist-v2/parsers";

function row(overrides: Partial<V2Row>): V2Row {
  return {
    ticker: "TEST",
    companyName: null,
    direction: "neutral",
    explanation: "",
    failureReason: null,
    price: null,
    changePct: null,
    volume: null,
    rvol: null,
    rvolClass: null,
    sessionType: "rth",
    sessionDate: "",
    analyzedAt: "",
    validThrough: "",
    intraday: [],
    driverIds: [],
    marketSignals: [],
    recentEvents: [],
    keyLevels: parseKeyLevels(null),
    inputsQuality: {},
    requestStatus: "none",
    requestError: null,
    hasV2: true,
    ...overrides,
  };
}

describe("densityTokens", () => {
  it("creates materially different layouts for three densities", () => {
    const c = densityTokens("comfortable");
    const k = densityTokens("compact");
    const t = densityTokens("terminal");
    expect(c.chartH).toBeGreaterThan(k.chartH);
    expect(k.chartH).toBeGreaterThan(t.chartH);
    expect(c.showSecondaryMeta).toBe(true);
    expect(t.showSecondaryMeta).toBe(false);
    expect(c.listGap).not.toBe(t.listGap);
    expect(parseDensity("terminal")).toBe("terminal");
    expect(parseDensity("nope")).toBe("compact");
  });
});

describe("sortRows stability", () => {
  it("places unavailable values after evaluable and ties by ticker", () => {
    const rows = [
      row({ ticker: "ZZZ", volume: null }),
      row({ ticker: "AAA", volume: 100 }),
      row({ ticker: "BBB", volume: 100 }),
      row({ ticker: "CCC", volume: null }),
    ];
    const sorted = sortRows(rows, "volume", new Map());
    expect(sorted.map((r) => r.ticker)).toEqual(["AAA", "BBB", "CCC", "ZZZ"]);
  });
});

describe("rowMatchesFilter advancing/declining", () => {
  it("filters only evaluable directional moves", () => {
    const up = row({ ticker: "UP", changePct: 1.2 });
    const down = row({ ticker: "DN", changePct: -0.5 });
    const miss = row({ ticker: "NA", changePct: null });
    expect(rowMatchesFilter(up, "advancing", new Map())).toBe(true);
    expect(rowMatchesFilter(down, "advancing", new Map())).toBe(false);
    expect(rowMatchesFilter(miss, "advancing", new Map())).toBe(false);
    expect(rowMatchesFilter(down, "declining", new Map())).toBe(true);
  });
});

describe("computeSummaryMetrics honesty", () => {
  it("returns null advancing when no changePct is evaluable", () => {
    const metrics = computeSummaryMetrics(
      [row({ ticker: "A", changePct: null })],
      new Map(),
    );
    expect(metrics.find((m) => m.key === "advancing")?.value).toBeNull();
  });
});
