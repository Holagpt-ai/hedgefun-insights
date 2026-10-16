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
import { currentMarketSessionLabel, hasFreshCatalyst, computeSummaryMetrics } from "@/lib/watchlist-v2/metrics";
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
    recentEvents: [
      {
        event_id: "e1",
        event_type: "news",
        title: "Headline",
        event_time: "2026-07-24T18:00:00Z",
        source_name: "Wire",
        source_url: "https://example.com/n",
        verification_state: "provider_reported",
      },
    ],
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

  it("keeps quote timestamp on stale snapshot even when same-session bars are fresh", () => {
    expect(watchlistQuoteDisplayTimestampMs(oldQuoteMs)).toBe(oldQuoteMs);
    const relieves = watchlistIntradayRelievesStaleSnapshot({
      analysisPresentation: "live",
      analysisSessionDate: "2026-07-24",
      snapshotMs: oldQuoteMs,
      intradayBars: [{ t: freshBarMs }],
      nowMs,
    });
    expect(relieves).toBe(true);
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
    expect(trust).toBe("DELAYED");
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
    expect(prov.chartEvidenceLabel).toMatch(/quote time unchanged/i);
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
    expect(formatPresentedWatchlistSignalBadge({ label: "BULLISH", scope: "live" })).toBe("BULLISH");
  });
});

describe("Batch 11 — session header calendar", () => {
  it("labels exchange holidays as closed, not regular hours", () => {
    const label = currentMarketSessionLabel(Date.parse("2026-01-01T15:00:00Z"));
    expect(label).toMatch(/closed/i);
  });
});

describe("Batch 11 — catalyst metric eligibility", () => {
  it("does not count provider news alone as a verified catalyst", () => {
    const withNewsOnly = v2Row({
      recentEvents: [
        {
          event_id: "e2",
          event_type: "news",
          title: "X",
          event_time: "2026-07-24T18:00:00Z",
          source_name: "Wire",
          source_url: "https://x.com",
          verification_state: "provider_reported",
        },
      ],
    });
    expect(hasFreshCatalyst(withNewsOnly)).toBe(false);
    const withRadar = v2Row({
      verifiedRecentEvent: { kind: "radar", title: "Gap scan", at: null },
    });
    expect(hasFreshCatalyst(withRadar)).toBe(true);
    const metrics = computeSummaryMetrics(
      [withNewsOnly, withRadar],
      new Map(),
    );
    expect(metrics.find((m) => m.key === "fresh_catalysts")?.value).toBe(1);
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
