import { describe, it, expect } from "vitest";
import {
  densityTokens,
  parseDensity,
  sortRows,
  rowMatchesFilter,
  computeSummaryMetrics,
  hasRecordedRadarOrEarningsContext,
} from "@/lib/watchlist-v2/metrics";
import type { V2Row } from "@/hooks/useWatchlistV2";
import { parseKeyLevels } from "@/lib/watchlist-v2/parsers";
import type { EarningsBadge } from "@/lib/watchlist-v2/earnings";

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
    sessionDisplayLabel: "",
    analysisPresentation: null,
    marketSignalSummary: null,
    priorSessionVolume: null,
    volYdayRatio: null,
    verifiedRecentEvent: null,
    scannerIntelligence: null,
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

describe("summary metric / filter alignment", () => {
  it("high RVOL count matches numeric rvol fallback filter", () => {
    const rows = [
      row({ ticker: "HI", rvol: 1.75, rvolClass: null }),
      row({ ticker: "LO", rvol: 1.1, rvolClass: "normal" }),
    ];
    const earnings = new Map<string, EarningsBadge>();
    const highRvol = computeSummaryMetrics(rows, earnings).find((m) => m.key === "high_rvol")?.value;
    const filtered = rows.filter((r) => rowMatchesFilter(r, "high_volume", earnings)).length;
    expect(highRvol).toBe(1);
    expect(filtered).toBe(highRvol);
  });

  it("earnings within 7 days excludes recent-only badges", () => {
    const rows = [row({ ticker: "E1" }), row({ ticker: "E2" })];
    const earnings = new Map<string, EarningsBadge>([
      [
        "E1",
        {
          kind: "upcoming",
          sortMs: Date.now() + 86_400_000,
          label: "Earnings Tomorrow",
          event: {} as EarningsBadge["event"],
        },
      ],
      [
        "E2",
        {
          kind: "recent",
          sortMs: Date.now() - 86_400_000,
          label: "Reported 1d ago",
          event: {} as EarningsBadge["event"],
        },
      ],
    ]);
    const count = computeSummaryMetrics(rows, earnings).find((m) => m.key === "earnings_7d")?.value;
    const filtered = rows.filter((r) => rowMatchesFilter(r, "earnings", earnings)).length;
    expect(count).toBe(1);
    expect(filtered).toBe(count);
  });

  it("recorded context requires dated verified_recent_event", () => {
    const nowMs = Date.parse("2026-07-24T19:00:00Z");
    expect(
      hasRecordedRadarOrEarningsContext(
        row({ verifiedRecentEvent: { kind: "radar", title: "Trigger", at: null } }),
        nowMs,
      ),
    ).toBe(false);
    expect(
      hasRecordedRadarOrEarningsContext(
        row({
          verifiedRecentEvent: {
            kind: "earnings",
            title: "Earnings 2026-07-24",
            at: "2026-07-24T15:00:00Z",
          },
        }),
        nowMs,
      ),
    ).toBe(true);
  });
});
