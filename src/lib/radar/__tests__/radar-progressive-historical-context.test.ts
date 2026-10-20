import { describe, expect, it, vi } from "vitest";
import type { RadarV2ScreenerRow } from "@/lib/screeners/radar-v2-adapter";
import {
  chunkRadarHistoricalContextRequests,
  RADAR_HISTORICAL_CONTEXT_MAX_REQUESTS_PER_BATCH,
} from "@/lib/radar/radar-historical-context-bounds";
import {
  buildPrioritizedHistoricalBatches,
  orderRadarRowsForHistoricalPriority,
} from "@/lib/radar/radar-historical-context-priority";
import {
  mergeHistoricalContextBatchIntoRows,
} from "@/lib/radar/apply-radar-historical-context";
import {
  fetchRadarHistoricalContextBatch,
  RadarHistoricalContextHttpError,
} from "@/lib/radar/radar-historical-context-client";
import {
  invalidateRadarHistoricalEnrichment,
  notifyRadarHistoricalPublication,
  requestRadarHistoricalContextPriority,
  resetRadarHistoricalContextStateForTests,
  runRadarProgressiveHistoricalContext,
} from "@/lib/radar/radar-progressive-historical-context";
import {
  clearRadarHistoricalCacheSymbol,
  mergeHistoricalFieldsOntoLatestRows,
  radarHistoricalCacheFingerprintForRow,
  radarHistoricalSessionScopeKey,
  RADAR_HISTORICAL_CACHE_TTL_MS,
  readRadarHistoricalCache,
  writeRadarHistoricalCache,
} from "@/lib/radar/radar-historical-context-cache";
import { buildRadarRepeatMoversView, radarRepeatMoversRankFingerprint } from "@/lib/radar/build-radar-repeat-movers-view";
import type { RepeatMoverContext } from "@/types/repeat-mover";

const SECURITY_ID = "11111111-1111-4111-8111-111111111111";

function validContext(symbol: string): RepeatMoverContext {
  return {
    version: "v1",
    securityId: SECURITY_ID,
    currentSymbol: symbol,
    currentContext: {
      observedSymbol: symbol,
      sessionDate: "2026-09-22",
      movePct: 5,
      volume: 1_000_000,
      rvol: null,
      dollarVolume: null,
      direction: "POSITIVE",
      tier: "NOTABLE",
      recordedAt: "2026-09-22T15:59:00.000Z",
    },
    profile: {
      profileAvailable: true,
      sampleSizeQuality: "ROBUST",
      sessionsObserved: 20,
      episodeCount: 3,
    },
    comparableHistory: {
      episodes: [],
    },
    evidenceLabels: ["RECURRING_MOVER"],
    assembledAt: "2026-09-22T16:00:00.000Z",
  } as unknown as RepeatMoverContext;
}

function row(symbol: string, volume: number, radarRank?: number): RadarV2ScreenerRow {
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
    provider_as_of: "2026-09-16T15:00:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-16T15:05:00.000Z",
    radar_rank: radarRank,
    radar_trading_date: "2026-09-22",
    signal_tier: "ACTIVE",
  } as RadarV2ScreenerRow;
}

describe("radar historical context batching", () => {
  for (const count of [1, 20, 21, 40, 100, 200]) {
    it(`splits ${count} symbols into batches of at most 20`, () => {
      const rows = Array.from({ length: count }, (_, index) => row(`S${index}`, 1_000_000 - index));
      const batches = buildPrioritizedHistoricalBatches({ rows });
      expect(batches.length).toBe(Math.ceil(count / RADAR_HISTORICAL_CONTEXT_MAX_REQUESTS_PER_BATCH));
      for (const batch of batches) {
        expect(batch.length).toBeLessThanOrEqual(20);
        expect(batch.length).toBeGreaterThan(0);
      }
      expect(batches.flat().map((request) => request.symbol)).toHaveLength(count);
    });
  }

  it("loads highest-ranked volume-first symbols in the first batch", () => {
    const rows = [
      row("LOW", 100, 3),
      row("MID", 500, 2),
      row("TOP", 900, 1),
    ];
    const ordered = orderRadarRowsForHistoricalPriority(rows);
    expect(ordered.map((entry) => entry.symbol)).toEqual(["TOP", "MID", "LOW"]);
    const [firstBatch] = buildPrioritizedHistoricalBatches({ rows });
    expect(firstBatch.map((request) => request.symbol)).toEqual(["TOP", "MID", "LOW"]);
  });

  it("prioritizes user-selected symbols ahead of later ranks", () => {
    const rows = Array.from({ length: 25 }, (_, index) => row(`S${index}`, 1_000_000 - index, index + 1));
    const batches = buildPrioritizedHistoricalBatches({
      rows,
      userPrioritySymbols: ["S24"],
    });
    expect(batches[0]?.[0]?.symbol).toBe("S24");
    expect(chunkRadarHistoricalContextRequests(batches.flat()).flat()).toHaveLength(25);
  });
});

describe("incremental historical merge safety", () => {
  it("does not wipe successful history when a later batch fails", async () => {
    const rows = [row("AAA", 1), row("BBB", 2), row("CCC", 3)];
    const mergedFirst = mergeHistoricalContextBatchIntoRows(rows, {
      results: [{ symbol: "AAA", securityId: "s1", historicalContext: validContext("AAA") }],
    });
    expect(mergedFirst[0]?.historicalContextLoadStatus).toBe("available");
    const mergedAfterFailure = mergeHistoricalContextBatchIntoRows(mergedFirst, { results: [] }, {
      failedSymbols: new Set(["BBB"]),
    });
    expect(mergedAfterFailure[0]?.historicalContextLoadStatus).toBe("available");
    expect(mergedAfterFailure[1]?.historicalContextLoadStatus).toBe("failed");
    expect(mergedAfterFailure[2]?.historicalContextLoadStatus).toBe("pending");
  });

  it("413 on one batch preserves other successful batches", async () => {
    resetRadarHistoricalContextStateForTests();
    const rows = Array.from({ length: 25 }, (_, index) => row(`S${index}`, 1_000 - index, index + 1));
    const updates: RadarV2ScreenerRow[][] = [];
    let call = 0;
    await runRadarProgressiveHistoricalContext({
      rows,
      syncedAt: "2026-09-16T15:00:00.000Z",
      sessionKind: "market",
      tradingDate: "2026-09-22",
      edgeUrl: "https://example.test/radar-historical-context",
      accessToken: "token",
      isCancelled: () => false,
      fetchImpl: async () => {
        call += 1;
        if (call === 2) {
          return new Response("too large", { status: 413 });
        }
        const body = {
          results: rows.slice((call - 1) * 20, call * 20).map((entry) => ({
            symbol: entry.symbol,
            securityId: null,
            historicalContext: null,
          })),
        };
        return new Response(JSON.stringify(body), { status: 200 });
      },
      onRowsUpdated: (next) => updates.push(next),
      config: { maxBatchesPerWake: 12 },
    });
    const last = updates.at(-1)!;
    expect(last.filter((entry) => entry.historicalContextLoadStatus === "unavailable").length).toBe(20);
    expect(last.filter((entry) => entry.historicalContextLoadStatus === "failed").length).toBe(5);
  });
});

describe("progressive historical scheduling", () => {
  it("publishes board updates without waiting for all batches", async () => {
    resetRadarHistoricalContextStateForTests();
    const rows = Array.from({ length: 40 }, (_, index) => row(`S${index}`, 500 - index, index + 1));
    const timestamps: number[] = [];
    notifyRadarHistoricalPublication({
      rows,
      sessionKind: "market",
      tradingDate: "2026-09-22",
      fetchBatch: async (requests) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return {
          results: requests.map((request) => ({
            symbol: request.symbol,
            securityId: null,
            historicalContext: null,
          })),
        };
      },
      onHistoricalRows: () => timestamps.push(Date.now()),
      isActive: () => true,
      config: { maxBatchesPerWake: 12 },
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(timestamps.length).toBeGreaterThan(0);
  });

  it("stops scheduling after cancellation", async () => {
    resetRadarHistoricalContextStateForTests();
    let cancelled = false;
    let fetchCalls = 0;
    await runRadarProgressiveHistoricalContext({
      rows: Array.from({ length: 25 }, (_, index) => row(`S${index}`, 500 - index, index + 1)),
      syncedAt: "2026-09-16T15:00:00.000Z",
      sessionKind: "market",
      tradingDate: "2026-09-22",
      edgeUrl: "https://example.test/radar-historical-context",
      accessToken: "token",
      isCancelled: () => cancelled,
      fetchImpl: async (_url, init) => {
        fetchCalls += 1;
        cancelled = true;
        const body = JSON.parse(String(init?.body ?? "{}")) as { requests: { symbol: string }[] };
        return new Response(JSON.stringify({
          results: body.requests.map((request) => ({
            symbol: request.symbol,
            securityId: null,
            historicalContext: null,
          })),
        }), { status: 200 });
      },
      onRowsUpdated: () => undefined,
      config: { maxBatchesPerWake: 12 },
    });
    expect(fetchCalls).toBe(1);
  });

  it("reuses cached symbols across synced_at polls without duplicate fetch work", async () => {
    resetRadarHistoricalContextStateForTests();
    let fetchCalls = 0;
    const fetchImpl = async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({
        results: [{ symbol: "AAA", securityId: "sec", historicalContext: null }],
      }), { status: 200 });
    };
    const notify = (volume: number) => notifyRadarHistoricalPublication({
      rows: [row("AAA", volume, 1)],
      sessionKind: "market",
      tradingDate: "2026-09-22",
      fetchBatch: async () => {
        fetchCalls += 1;
        return {
          results: [{ symbol: "AAA", securityId: "sec", historicalContext: null }],
        };
      },
      onHistoricalRows: () => undefined,
      isActive: () => true,
      config: { sessionCacheTtlMs: 60_000, maxBatchesPerWake: 12 },
    });
    notify(100);
    await new Promise((resolve) => setTimeout(resolve, 20));
    notify(500);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchCalls).toBe(1);
  });

  it("never replaces newer market fields when historical results arrive late", async () => {
    resetRadarHistoricalContextStateForTests();
    const updates: RadarV2ScreenerRow[] = [];
    notifyRadarHistoricalPublication({
      rows: [row("AAA", 100, 1)],
      sessionKind: "market",
      tradingDate: "2026-09-22",
      fetchBatch: async () => ({
        results: [{ symbol: "AAA", securityId: "sec", historicalContext: validContext("AAA") }],
      }),
      onHistoricalRows: (rows) => updates.push(...rows),
      isActive: () => true,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const latest = [row("AAA", 999, 1)];
    latest[0]!.provider_as_of = "2026-09-16T15:02:00.000Z";
    const merged = mergeHistoricalFieldsOntoLatestRows(latest, updates);
    expect(merged[0]?.volume).toBe(999);
    expect(merged[0]?.historicalContextLoadStatus).toBe("available");
  });

  it("updates Repeat Movers without changing Discovery ranking fingerprint", async () => {
    const rows = [
      row("AAA", 2_000, 1),
      row("BBB", 1_000, 2),
    ];
    const before = radarRepeatMoversRankFingerprint(rows);
    const merged = mergeHistoricalContextBatchIntoRows(rows, {
      results: [{
        symbol: "BBB",
        securityId: "sec-b",
        historicalContext: validContext("BBB"),
      }],
    });
    const view = buildRadarRepeatMoversView(merged, { nowMs: Date.now() });
    expect(radarRepeatMoversRankFingerprint(merged)).toBe(before);
    expect(view.repeatMovers.map((entry) => entry.symbol)).toEqual(["BBB"]);
  });

  it("eventually enriches deep rows while soft polls continue", async () => {
    resetRadarHistoricalContextStateForTests();
    const rows = Array.from({ length: 100 }, (_, index) => row(`S${index}`, 10_000 - index, index + 1));
    const fetchedSymbols = new Set<string>();
    const publish = (volumeOffset: number) => notifyRadarHistoricalPublication({
      rows: rows.map((entry, index) => row(entry.symbol, entry.volume! + volumeOffset, index + 1)),
      sessionKind: "market",
      tradingDate: "2026-09-22",
      fetchBatch: async (requests) => {
        for (const request of requests) fetchedSymbols.add(request.symbol);
        return {
          results: requests.map((request) => ({
            symbol: request.symbol,
            securityId: null,
            historicalContext: null,
          })),
        };
      },
      onHistoricalRows: () => undefined,
      isActive: () => true,
      config: { maxBatchesPerWake: 4 },
    });
    publish(0);
    for (let poll = 0; poll < 4; poll += 1) {
      await new Promise((resolve) => setTimeout(resolve, 15));
      publish(poll + 1);
    }
    expect(fetchedSymbols.has("S80")).toBe(true);
    expect(fetchedSymbols.size).toBeLessThanOrEqual(100);
  });

  it("clears enrichment when the board becomes empty", async () => {
    resetRadarHistoricalContextStateForTests();
    let historicalUpdates = 0;
    notifyRadarHistoricalPublication({
      rows: [row("AAA", 100, 1)],
      sessionKind: "market",
      tradingDate: "2026-09-22",
      fetchBatch: async () => ({
        results: [{ symbol: "AAA", securityId: "sec", historicalContext: validContext("AAA") }],
      }),
      onHistoricalRows: () => {
        historicalUpdates += 1;
      },
      isActive: () => true,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    notifyRadarHistoricalPublication({
      rows: [],
      sessionKind: "market",
      tradingDate: "2026-09-22",
      fetchBatch: async () => ({ results: [] }),
      onHistoricalRows: () => {
        historicalUpdates += 1;
      },
      isActive: () => true,
    });
    invalidateRadarHistoricalEnrichment();
    expect(historicalUpdates).toBeGreaterThan(0);
  });

  it("does not apply stale batch results after session invalidation completes late", async () => {
    resetRadarHistoricalContextStateForTests();
    const newScope = radarHistoricalSessionScopeKey({ sessionKind: "market", tradingDate: "2026-09-23" });
    const fingerprint = radarHistoricalCacheFingerprintForRow(row("AAA", 1));
    let firstPublicationActive = true;
    let latestSymbols: string[] = [];
    notifyRadarHistoricalPublication({
      rows: [row("AAA", 100, 1)],
      sessionKind: "market",
      tradingDate: "2026-09-22",
      fetchBatch: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {
          results: [{ symbol: "AAA", securityId: null, historicalContext: validContext("AAA") }],
        };
      },
      onHistoricalRows: () => undefined,
      isActive: () => firstPublicationActive,
    });
    firstPublicationActive = false;
    notifyRadarHistoricalPublication({
      rows: [row("BBB", 200, 1)],
      sessionKind: "market",
      tradingDate: "2026-09-23",
      fetchBatch: async () => ({ results: [] }),
      onHistoricalRows: (rows) => {
        latestSymbols = rows.map((entry) => entry.symbol);
      },
      isActive: () => true,
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(latestSymbols).toEqual(["BBB"]);
    expect(readRadarHistoricalCache("AAA", fingerprint, newScope, Date.now())).toBeNull();
  });

  it("retries failed symbols after cache TTL and user priority", async () => {
    resetRadarHistoricalContextStateForTests();
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
    let fetchCalls = 0;
    notifyRadarHistoricalPublication({
      rows: [row("AAA", 100, 1)],
      sessionKind: "market",
      tradingDate: "2026-09-22",
      fetchBatch: async () => {
        fetchCalls += 1;
        return { results: [{ symbol: "AAA", securityId: "sec", historicalContext: null }] };
      },
      onHistoricalRows: () => undefined,
      isActive: () => true,
      config: { sessionCacheTtlMs: RADAR_HISTORICAL_CACHE_TTL_MS, maxBatchesPerWake: 2 },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(fetchCalls).toBe(0);
    requestRadarHistoricalContextPriority("AAA");
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(fetchCalls).toBe(1);
  });

  it("preserves rich context when a refresh batch fails", async () => {
    resetRadarHistoricalContextStateForTests();
    const scope = radarHistoricalSessionScopeKey({ sessionKind: "market", tradingDate: "2026-09-22" });
    const updates: RadarV2ScreenerRow[][] = [];
    const publish = (volume: number, fetchBatch: () => Promise<{ results: { symbol: string; securityId: string; historicalContext: RepeatMoverContext }[] }>) => notifyRadarHistoricalPublication({
      rows: [row("AAA", volume, 1)],
      sessionKind: "market",
      tradingDate: "2026-09-22",
      fetchBatch,
      onHistoricalRows: (next) => updates.push(next),
      isActive: () => true,
      config: { maxBatchesPerWake: 2, transientRetryDelaysMs: [] },
    });
    publish(100, async () => ({
      results: [{ symbol: "AAA", securityId: "sec", historicalContext: validContext("AAA") }],
    }));
    await new Promise((resolve) => setTimeout(resolve, 30));
    clearRadarHistoricalCacheSymbol("AAA", scope);
    publish(500, async () => {
      throw new RadarHistoricalContextHttpError(503);
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const last = updates.at(-1)!;
    expect(last[0]?.historicalContextLoadStatus).toBe("available");
    expect(last[0]?.historicalContext).not.toBeNull();
    expect(last[0]?.volume).toBe(500);
  });

  it("does not retry invalid 413 batch requests", async () => {
    let calls = 0;
    await expect(
      fetchRadarHistoricalContextBatch({
        url: "https://example.test",
        requests: Array.from({ length: 21 }, (_, index) => ({
          symbol: `S${index}`,
        })),
        fetchImpl: async () => {
          calls += 1;
          return new Response("nope", { status: 413 });
        },
      }),
    ).rejects.toBeInstanceOf(RadarHistoricalContextHttpError);
    expect(calls).toBe(1);
  });
});
