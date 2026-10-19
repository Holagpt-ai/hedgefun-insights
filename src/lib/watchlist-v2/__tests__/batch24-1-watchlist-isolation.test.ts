import { describe, expect, it } from "vitest";
import {
  normalizeSymbolsKey,
  watchlistAnalysisPlaceholder,
  watchlistAnalysisQueryKey,
  watchlistSymbolsPlaceholder,
  watchlistSymbolsQueryKey,
} from "@/lib/watchlist-v2/watchlist-query-isolation";
import {
  resolveWatchlistVerifiedCatalyst,
  watchlistPriceObservationMs,
} from "@/lib/watchlist-v2/watchlist-catalyst-context";
import { parseKeyLevels } from "@/lib/watchlist-v2/parsers";
import type { V2Row } from "@/hooks/useWatchlistV2";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import type { CatalystEvent } from "@/types/catalyst";

function v2Row(overrides: Partial<V2Row> = {}): V2Row {
  return {
    ticker: "ABC",
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
    sessionDate: "2026-08-27",
    analyzedAt: "2026-08-27T19:00:00Z",
    validThrough: "2099-12-31T23:59:59.000Z",
    intraday: [],
    driverIds: [],
    marketSignals: [],
    recentEvents: [],
    keyLevels: parseKeyLevels(null),
    inputsQuality: {},
    sessionDisplayLabel: "",
    analysisPresentation: "live",
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

describe("Batch 24.1 — watchlist query isolation", () => {
  it("does not carry symbol placeholder data across authenticated users", () => {
    const keep = watchlistSymbolsPlaceholder("user-b");
    const prevRows = [{ id: "1", symbol: "AAPL", added_at: null }];
    const fromUserA = {
      queryKey: watchlistSymbolsQueryKey("user-a"),
    };
    expect(keep(prevRows, fromUserA as never)).toBeUndefined();
    const fromUserB = { queryKey: watchlistSymbolsQueryKey("user-b") };
    expect(keep(prevRows, fromUserB as never)).toEqual(prevRows);
  });

  it("does not carry analysis placeholder across symbol set changes", () => {
    const keep = watchlistAnalysisPlaceholder("user-1", ["AAPL", "MSFT"]);
    const prevAnalysis = [{ ticker: "AAPL" }];
    const sameSet = {
      queryKey: watchlistAnalysisQueryKey("user-1", ["MSFT", "AAPL"]),
    };
    expect(keep(prevAnalysis, sameSet as never)).toEqual(prevAnalysis);
    const differentSet = {
      queryKey: watchlistAnalysisQueryKey("user-1", ["AAPL", "TSLA"]),
    };
    expect(keep(prevAnalysis, differentSet as never)).toBeUndefined();
  });

  it("normalizes symbol keys for stable analysis query identity", () => {
    expect(normalizeSymbolsKey(["msft", "AAPL", "MSFT"])).toBe("AAPL,MSFT");
  });
});

describe("Batch 24.1 — catalyst observation timestamps", () => {
  const NOW = Date.parse("2026-08-27T16:00:00.000Z");

  function evt(): CatalystEvent {
    return {
      id: "c1",
      dedupe_key: "dk:c1",
      symbol: "ABC",
      company_name: "ABC Corp",
      event_type: "product_contract",
      verification_state: "provider_reported",
      event_date: "2026-08-27",
      event_time: null,
      time_of_day: null,
      title: "ABC announces new contract with federal agency",
      description: null,
      source_name: "Press release",
      source_url: "https://example.com/a",
      provider: "polygon",
      related_symbols: ["ABC"],
      facts: { attribution_class: "direct" },
      published_at: "2026-08-27T14:00:00.000Z",
      attribution_class: "direct",
      ticker_specific: true,
    };
  }

  function entry(): CatalystEnrichmentEntry {
    return { event: evt(), kind: "recent", sortMs: NOW - 3_600_000 };
  }

  it("uses snapshot_ts_ms only for price observation reference", () => {
    expect(watchlistPriceObservationMs(v2Row({ inputsQuality: {} }))).toBeNull();
    expect(
      watchlistPriceObservationMs(
        v2Row({ inputsQuality: { snapshot_ts_ms: NOW - 600_000 } }),
      ),
    ).toBe(NOW - 600_000);
  });

  it("ignores validThrough and analyzedAt as faux observation times", () => {
    const row = v2Row({
      analyzedAt: "2026-08-27T19:00:00Z",
      validThrough: "2099-12-31T23:59:59.000Z",
      inputsQuality: {},
    });
    expect(watchlistPriceObservationMs(row)).toBeNull();
    expect(resolveWatchlistVerifiedCatalyst(row, entry(), NOW)).toBeNull();
  });

  it("allows verified catalyst when snapshot observation is within recent window", () => {
    const row = v2Row({ inputsQuality: { snapshot_ts_ms: NOW - 600_000 } });
    expect(resolveWatchlistVerifiedCatalyst(row, entry(), NOW)?.eventId).toBe("c1");
  });
});
