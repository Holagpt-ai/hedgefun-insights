import { describe, it, expect } from "vitest";
import { resolveWatchlistMarketDataTrust } from "@/lib/market-data/trust-states";
import {
  formatPresentedWatchlistSignalBadge,
  presentWatchlistMarketSignal,
} from "@/lib/watchlist-v2/market-signal-summary";
import { buildWatchlistQuoteProvenance } from "@/lib/watchlist-v2/watchlist-quote-provenance";
import {
  watchlistIntradayRelievesStaleSnapshot,
  watchlistQuoteDisplayTimestampMs,
} from "@/lib/watchlist-v2/watchlist-quote-coherence";
import {
  computeSummaryMetrics,
  currentMarketSessionLabel,
  hasRecordedRadarOrEarningsContext,
  rowMatchesFilter,
} from "@/lib/watchlist-v2/metrics";
import { resolveWatchlistRowRequestStatus } from "@/lib/watchlist-v2/watchlist-request-status";
import type { V2Row } from "@/hooks/useWatchlistV2";
import { parseKeyLevels } from "@/lib/watchlist-v2/parsers";

function v2Row(overrides: Partial<V2Row>): V2Row {
  return {
    ticker: "TEST",
    companyName: null,
    direction: "neutral",
    explanation: "",
    failureReason: null,
    price: 10,
    changePct: 1,
    volume: 1_000_000,
    rvol: 1.2,
    rvolClass: null,
    sessionType: "rth",
    sessionDate: "2026-07-24",
    analyzedAt: "2026-07-24T19:00:00Z",
    validThrough: "2026-07-24T20:00:00Z",
    intraday: [],
    driverIds: [],
    marketSignals: [],
    recentEvents: [],
    keyLevels: parseKeyLevels(null),
    inputsQuality: {},
    sessionDisplayLabel: "",
    analysisPresentation: "live",
    marketSignalSummary: { label: "MOMENTUM", rule_id: "rule.momentum" },
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

describe("Batch 11 — quote vs chart bar provenance", () => {
  const nowMs = Date.parse("2026-07-24T19:30:00Z");
  const oldQuoteMs = nowMs - 50 * 60_000;
  const freshBarMs = nowMs - 2 * 60_000;

  it("keeps quote timestamp stale when bars are fresh (no feed note)", () => {
    expect(watchlistQuoteDisplayTimestampMs(oldQuoteMs)).toBe(oldQuoteMs);
    expect(
      watchlistIntradayRelievesStaleSnapshot({
        analysisPresentation: "live",
        analysisSessionDate: "2026-07-24",
        snapshotMs: oldQuoteMs,
        intradayBars: [{ t: freshBarMs }],
        nowMs,
      }),
    ).toBe(true);
    const trust = resolveWatchlistMarketDataTrust({
      hasV2: true,
      validThrough: new Date(nowMs + 60_000).toISOString(),
      snapshotTsMs: oldQuoteMs,
      analysisPresentation: "live",
      analysisSessionDate: "2026-07-24",
      intradayBars: [{ t: freshBarMs }],
      nowMs,
    });
    expect(trust).toBe("STALE");
    const prov = buildWatchlistQuoteProvenance({
      snapshotMs: oldQuoteMs,
      trust,
      analysisPresentation: "live",
      analysisSessionDate: "2026-07-24",
      intradayBars: [{ t: freshBarMs }],
      nowMs,
    });
    expect(prov.quoteTimestampMs).toBe(oldQuoteMs);
    expect(prov.intradayRelievesStaleSnapshot).toBe(true);
    expect(prov.chartEvidenceLabel).toMatch(/Chart bars through/i);
  });

  it("does not upgrade stale quote to Delayed solely because of fresh bars", () => {
    const trust = resolveWatchlistMarketDataTrust({
      hasV2: true,
      validThrough: new Date(nowMs + 60_000).toISOString(),
      snapshotTsMs: oldQuoteMs,
      analysisPresentation: "live",
      analysisSessionDate: "2026-07-24",
      intradayBars: [{ t: freshBarMs }],
      feedDelayNote: "provider feed is 15-minute delayed",
      nowMs,
    });
    expect(trust).toBe("STALE");
  });
});

describe("Batch 11 — delayed market signal scope", () => {
  it("does not present delayed trust as a live signal badge", () => {
    const presented = presentWatchlistMarketSignal(
      { label: "MOMENTUM", rule_id: "rule.momentum" },
      "DELAYED",
    );
    expect(presented?.scope).toBe("delayed");
    expect(formatPresentedWatchlistSignalBadge(presented!)).toMatch(/delayed snapshot/i);
  });
});

describe("Batch 11 — session header calendar", () => {
  it("labels exchange holidays as closed, not regular hours", () => {
    const label = currentMarketSessionLabel(Date.parse("2026-01-01T15:00:00Z"));
    expect(label).toMatch(/closed/i);
  });
});

describe("Batch 11 — recorded context metric", () => {
  const nowMs = Date.parse("2026-07-24T19:30:00Z");

  it("requires a dated observation within the window", () => {
    expect(
      hasRecordedRadarOrEarningsContext(
        v2Row({ verifiedRecentEvent: { kind: "radar", title: "Gap scan", at: null } }),
        nowMs,
      ),
    ).toBe(false);
    expect(
      hasRecordedRadarOrEarningsContext(
        v2Row({
          verifiedRecentEvent: {
            kind: "radar",
            title: "Gap scan",
            at: "2026-07-24T18:00:00Z",
          },
        }),
        nowMs,
      ),
    ).toBe(true);
  });
});

describe("Batch 11 — refresh request vs completed analysis", () => {
  it("treats succeeded request as pending until analysis catches up", () => {
    const out = resolveWatchlistRowRequestStatus({
      status: "succeeded",
      error_code: null,
      requested_at: "2026-07-24T19:00:00Z",
      completed_at: "2026-07-24T19:05:00Z",
      analyzedAt: "2026-07-24T18:50:00Z",
    });
    expect(out.requestStatus).toBe("pending");
  });

  it("treats succeeded without valid completed_at as pending", () => {
    const out = resolveWatchlistRowRequestStatus({
      status: "succeeded",
      error_code: null,
      requested_at: "2026-07-24T19:00:00Z",
      completed_at: undefined,
      analyzedAt: "2026-07-24T19:10:00Z",
    });
    expect(out.requestStatus).toBe("pending");
  });

  it("allows succeeded when analyzed_at is after completion", () => {
    const out = resolveWatchlistRowRequestStatus({
      status: "succeeded",
      error_code: null,
      requested_at: "2026-07-24T19:00:00Z",
      completed_at: "2026-07-24T19:05:00Z",
      analyzedAt: "2026-07-24T19:06:00Z",
    });
    expect(out.requestStatus).toBe("succeeded");
  });
});

describe("Batch 11 — invalid snapshot timestamps", () => {
  it("honestly handles missing snapshot for trust and quote label", () => {
    expect(resolveWatchlistMarketDataTrust({ hasV2: true, validThrough: null, snapshotTsMs: null })).toBe(
      "UNAVAILABLE",
    );
    const prov = buildWatchlistQuoteProvenance({
      snapshotMs: null,
      trust: "UNAVAILABLE",
      analysisPresentation: "live",
      analysisSessionDate: "2026-07-24",
      intradayBars: [],
    });
    expect(prov.quoteAsOfLabel).toMatch(/unavailable/i);
  });
});

describe("Batch 11 — summary count matches filter", () => {
  it("aligns recorded context, earnings 7d, and high rvol metrics with filters", () => {
    const nowMs = Date.now();
    const rows = [
      v2Row({
        ticker: "CTX",
        verifiedRecentEvent: {
          kind: "earnings",
          title: "Earnings context",
          at: new Date(nowMs - 3 * 60 * 60_000).toISOString(),
        },
      }),
      v2Row({ ticker: "RVOL", rvol: 1.6, rvolClass: null }),
      v2Row({ ticker: "NONE", rvol: 0.8, rvolClass: "normal" }),
    ];
    const earnings = new Map([
      [
        "CTX",
        {
          kind: "recent" as const,
          sortMs: nowMs - 86_400_000,
          label: "Reported 1d ago",
          event: {} as never,
        },
      ],
    ]);
    const metrics = computeSummaryMetrics(rows, earnings);
    const recorded = metrics.find((m) => m.key === "recorded_context");
    const highRvol = metrics.find((m) => m.key === "high_rvol");
    const earnings7d = metrics.find((m) => m.key === "earnings_7d");

    expect(recorded?.value).toBe(1);
    expect(rows.filter((r) => rowMatchesFilter(r, "catalysts", earnings)).length).toBe(
      recorded?.value,
    );

    expect(highRvol?.value).toBe(1);
    expect(rows.filter((r) => rowMatchesFilter(r, "high_volume", earnings)).length).toBe(
      highRvol?.value,
    );

    expect(earnings7d?.value).toBe(0);
    expect(rows.filter((r) => rowMatchesFilter(r, "earnings", earnings)).length).toBe(
      earnings7d?.value,
    );
  });
});
