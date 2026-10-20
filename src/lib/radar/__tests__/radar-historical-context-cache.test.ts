import { describe, expect, it, vi } from "vitest";
import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";
import {
  applyRadarHistoricalCacheToRows,
  mergeHistoricalFieldsOntoLatestRows,
  radarHistoricalCacheFingerprintForRow,
  radarHistoricalQueryFingerprint,
  radarHistoricalSessionScopeKey,
  RADAR_HISTORICAL_CACHE_TTL_MS,
  readRadarHistoricalCache,
  resetRadarHistoricalContextCacheForTests,
  writeRadarHistoricalCache,
} from "@/lib/radar/radar-historical-context-cache";
import { classifyHistoricalContextBatchResult } from "@/lib/radar/radar-historical-context-classify";

function row(
  symbol: string,
  volume: number,
  synced = "2026-09-16T15:00:00.000Z",
  overrides: Partial<RadarV2ScreenerRow> = {},
): RadarV2ScreenerRow {
  return {
    tab_id: "day_trade_radar",
    symbol,
    company_name: symbol,
    price: 10,
    change_percent: 1,
    volume,
    avg_volume: null,
    rvol: null,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    market_cap: null,
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    avg_volume_20d: null,
    rvol_20d: null,
    day_high: null,
    day_low: null,
    range_event: null,
    provider_as_of: synced,
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: synced,
    radar_trading_date: "2026-09-22",
    signal_tier: "ACTIVE",
    radar_rank: 1,
    ...overrides,
  } as RadarV2ScreenerRow;
}

describe("radar historical cache identity", () => {
  it("keys cache by symbol fingerprint and session scope, not synced_at", () => {
    resetRadarHistoricalContextCacheForTests();
    const scope = radarHistoricalSessionScopeKey({ sessionKind: "market", tradingDate: "2026-09-22" });
    const fingerprint = radarHistoricalCacheFingerprintForRow(row("AAA", 1));
    writeRadarHistoricalCache({
      symbol: "AAA",
      fingerprint,
      securityId: "sec-1",
      historicalContext: null,
      loadStatus: "unavailable",
      fetchedAtMs: 1_000,
      sessionScope: scope,
    });
    expect(readRadarHistoricalCache("AAA", fingerprint, scope, 2_000)).not.toBeNull();
  });

  it("normalizes ACTIVE lifecycle tier to the same fingerprint as mapRadarEnrichmentRequest", () => {
    const activeRow = row("AAA", 1, undefined, { signal_tier: "ACTIVE" });
    const notableRow = row("AAA", 1, undefined, { signal_tier: "NOTABLE" });
    expect(radarHistoricalCacheFingerprintForRow(activeRow)).toBe(
      radarHistoricalQueryFingerprint({
        symbol: "AAA",
        sessionDate: "2026-09-22",
        tier: null,
      }),
    );
    expect(radarHistoricalCacheFingerprintForRow(notableRow)).toBe(
      radarHistoricalQueryFingerprint({
        symbol: "AAA",
        sessionDate: "2026-09-22",
        tier: "NOTABLE",
      }),
    );
  });

  it("reuses cache when Edge resolves securityId after a null request", () => {
    resetRadarHistoricalContextCacheForTests();
    const scope = radarHistoricalSessionScopeKey({ sessionKind: "market", tradingDate: "2026-09-22" });
    const fingerprint = radarHistoricalCacheFingerprintForRow(row("AAA", 1));
    writeRadarHistoricalCache({
      symbol: "AAA",
      fingerprint,
      securityId: "sec-resolved",
      historicalContext: null,
      loadStatus: "unavailable",
      fetchedAtMs: 5_000,
      sessionScope: scope,
    });
    const refreshed = applyRadarHistoricalCacheToRows({
      rows: [row("AAA", 500, "2026-09-16T15:01:00.000Z", { securityId: "sec-resolved" })],
      sessionScope: scope,
      nowMs: 6_000,
    });
    expect(refreshed[0]?.historicalContextLoadStatus).toBe("unavailable");
    expect(refreshed[0]?.securityId).toBe("sec-resolved");
  });

  it("rejects cache when row securityId conflicts with cached securityId", () => {
    resetRadarHistoricalContextCacheForTests();
    const scope = radarHistoricalSessionScopeKey({ sessionKind: "market", tradingDate: "2026-09-22" });
    const fingerprint = radarHistoricalCacheFingerprintForRow(row("AAA", 1));
    writeRadarHistoricalCache({
      symbol: "AAA",
      fingerprint,
      securityId: "sec-1",
      historicalContext: null,
      loadStatus: "unavailable",
      fetchedAtMs: 5_000,
      sessionScope: scope,
    });
    const refreshed = applyRadarHistoricalCacheToRows({
      rows: [row("AAA", 500, undefined, { securityId: "sec-2" })],
      sessionScope: scope,
      nowMs: 6_000,
    });
    expect(refreshed[0]?.historicalContextLoadStatus).toBe("pending");
  });

  it("reuses cache across refreshed boards when only synced_at advances", () => {
    resetRadarHistoricalContextCacheForTests();
    const scope = radarHistoricalSessionScopeKey({ sessionKind: "market", tradingDate: "2026-09-22" });
    const fingerprint = radarHistoricalCacheFingerprintForRow(row("AAA", 1));
    writeRadarHistoricalCache({
      symbol: "AAA",
      fingerprint,
      securityId: "sec-1",
      historicalContext: null,
      loadStatus: "unavailable",
      fetchedAtMs: 5_000,
      sessionScope: scope,
    });
    const refreshed = applyRadarHistoricalCacheToRows({
      rows: [row("AAA", 500, "2026-09-16T15:01:00.000Z")],
      sessionScope: scope,
      nowMs: 6_000,
    });
    expect(refreshed[0]?.historicalContextLoadStatus).toBe("unavailable");
    expect(refreshed[0]?.volume).toBe(500);
  });

  it("allows failed cache entries to expire for retry", () => {
    resetRadarHistoricalContextCacheForTests();
    const scope = radarHistoricalSessionScopeKey({ sessionKind: "market", tradingDate: "2026-09-22" });
    const fingerprint = radarHistoricalCacheFingerprintForRow(row("AAA", 1));
    writeRadarHistoricalCache({
      symbol: "AAA",
      fingerprint,
      securityId: null,
      historicalContext: null,
      loadStatus: "failed",
      fetchedAtMs: 0,
      sessionScope: scope,
    });
    expect(readRadarHistoricalCache("AAA", fingerprint, scope, RADAR_HISTORICAL_CACHE_TTL_MS - 1)).not.toBeNull();
    expect(readRadarHistoricalCache("AAA", fingerprint, scope, RADAR_HISTORICAL_CACHE_TTL_MS + 1)).toBeNull();
  });

  it("merges historical fields without replacing live market metrics", () => {
    const latest = [row("AAA", 900, "2026-09-16T15:02:00.000Z")];
    const historical = [{
      ...row("AAA", 100, "2026-09-16T15:00:00.000Z"),
      historicalContextLoadStatus: "unavailable" as const,
    }];
    const merged = mergeHistoricalFieldsOntoLatestRows(latest, historical);
    expect(merged[0]?.volume).toBe(900);
    expect(merged[0]?.provider_as_of).toBe("2026-09-16T15:02:00.000Z");
    expect(merged[0]?.historicalContextLoadStatus).toBe("unavailable");
  });

  it("classifies null Edge bodies as unavailable, not confirmed empty", () => {
    expect(classifyHistoricalContextBatchResult({ historicalContext: null })).toBe("unavailable");
  });
});
