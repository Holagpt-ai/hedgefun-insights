import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { historicalBackfillConfig } from "@/config/historical-backfill.config";
import { HistoricalBackfillEngine } from "@/lib/historical-backfill/engine";
import { detectDailyEpisode } from "@/lib/historical-backfill/episode-detector";
import { addCalendarDays } from "@/lib/historical-backfill/dates";
import { historicalDailyRvol, createRollingDailyRvol } from "@/lib/historical-backfill/historical-rvol";
import { normalizeDailyBar } from "@/lib/historical-backfill/normalize-daily-bar";
import { createPolygonDailyAdapter } from "@/lib/historical-backfill/polygon-daily-adapter";
import { withBoundedRetry } from "@/lib/historical-backfill/retry";
import { compareCandidatesVolumeFirst, type RadarV2CandidateRow } from "@/lib/screeners/radar-v2-adapter";
import { createSecurityIdentityStore } from "@/lib/security-identity/security-identity";
import { createSecurityIntelligenceStore } from "@/lib/security-intelligence/security-intelligence";
import type { DailyBarsRequest, DailyBarsResult, ProviderDailyBar } from "@/types/historical-backfill";
import type { SecurityIdentityObservation } from "@/types/security-identity";

const RECORDED = "2026-09-21T16:00:00.000Z";
const LATER = "2026-09-21T16:05:00.000Z";
const CONFIG = historicalBackfillConfig();

function identityInput(overrides: Partial<SecurityIdentityObservation>): SecurityIdentityObservation {
  return {
    symbol: "AAA",
    exchange: "NASDAQ",
    effectiveDate: "2020-01-02",
    source: "reference-feed",
    provenance: "PROVIDER",
    recordedAt: RECORDED,
    ...overrides,
  };
}

function bar(sessionDate: string, close = 10, volume = 1000, open = close): ProviderDailyBar {
  const high = Math.max(open, close);
  const low = Math.min(open, close);
  return { sessionDate, open, high, low, close, volume };
}

function supported(bars: readonly ProviderDailyBar[]): DailyBarsResult {
  return {
    coverage: "SUPPORTED",
    bars,
    source: "fixture",
    sourceAsOf: "2024-06-03T20:00:00.000Z",
    fetchedAt: "2024-06-03T20:01:00.000Z",
    error: null,
    complete: true,
  };
}

function listedSecurity(symbol = "AAA", figi = "BBG000000001") {
  const identity = createSecurityIdentityStore();
  const created = identity.resolve(identityInput({ symbol, figi, effectiveDate: "2020-01-02" }));
  return { identity, securityId: created.securityId! };
}

describe("Historical backfill engine V1", () => {
  it("1/2. job starts running and the cursor advances after a successful batch", async () => {
    const { identity, securityId } = listedSecurity();
    const intelligence = createSecurityIntelligenceStore();
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: { fetchDailyBars: async (request) => supported([bar(request.dateFrom)]) },
      config: { dateChunkDays: 1, maxChunksPerRun: 1, retryCount: 0 },
    });
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: "2024-06-05",
      dateFrom: "2024-06-03",
      dateTo: "2024-06-05",
      recordedAt: RECORDED,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.record.state).toBe("RUNNING");
    const stats = await engine.runBatch(started.record.jobId, LATER);
    expect(stats.state).toBe("RUNNING");
    expect(stats.cursorToken).toBe("0:2024-06-04");
    expect(stats.cursorDate).toBe("2024-06-04");
    expect(stats.rowsWritten).toBe(1);
    expect(stats.elapsedMs).toBe(5 * 60 * 1000);
  });

  it("3. a retry of the same security and session does not duplicate daily history", async () => {
    const { identity, securityId } = listedSecurity();
    const intelligence = createSecurityIntelligenceStore();
    const provider = { fetchDailyBars: async (request: DailyBarsRequest) => supported([bar(request.dateFrom)]) };
    const first = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider,
      config: { dateChunkDays: 1, maxChunksPerRun: 1, retryCount: 0 },
    });
    const started = await first.start({
      securities: [{ securityId }],
      completedSessionDate: "2024-06-03",
      dateFrom: "2024-06-03",
      dateTo: "2024-06-03",
      recordedAt: RECORDED,
    });
    if (!started.ok) throw new Error(started.reason);
    await first.runBatch(started.record.jobId, LATER);
    const second = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider,
      config: { dateChunkDays: 1, maxChunksPerRun: 1, retryCount: 0 },
    });
    const retry = await second.start({
      securities: [{ securityId }],
      completedSessionDate: "2024-06-03",
      dateFrom: "2024-06-03",
      dateTo: "2024-06-03",
      recordedAt: LATER,
    });
    if (!retry.ok) throw new Error(retry.reason);
    const stats = await second.runBatch(retry.record.jobId, "2026-09-21T16:10:00.000Z");
    expect(intelligence.listDailyHistory()).toHaveLength(1);
    expect(stats.duplicateRows).toBe(1);
    expect(stats.rowsWritten).toBe(0);
  });

  it("4/5. failure keeps the last checkpoint and resume continues without repeating it", async () => {
    const identity = createSecurityIdentityStore();
    const first = identity.resolve(identityInput({ symbol: "AAA", figi: "BBG00000000A" }));
    const second = identity.resolve(identityInput({ symbol: "BBB", figi: "BBG00000000B", exchange: "NYSE" }));
    const intelligence = createSecurityIntelligenceStore();
    let failSecond = true;
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: {
        fetchDailyBars: async (request) => {
          if (request.symbol === "BBB" && failSecond) throw new Error("provider down");
          return supported([bar(request.dateFrom)]);
        },
      },
      config: { dateChunkDays: 5, maxChunksPerRun: 1, retryCount: 0 },
    });
    const started = await engine.start({
      securities: [{ securityId: first.securityId! }, { securityId: second.securityId! }],
      completedSessionDate: "2024-06-03",
      dateFrom: "2024-06-03",
      dateTo: "2024-06-03",
      recordedAt: RECORDED,
    });
    if (!started.ok) throw new Error(started.reason);
    await engine.runBatch(started.record.jobId, LATER);
    const failed = await engine.runBatch(started.record.jobId, LATER);
    expect(failed.state).toBe("FAILED");
    expect(failed.cursorToken).toBe("1:2024-06-03");
    expect(intelligence.listDailyHistory().map((row) => row.securityId)).toEqual([first.securityId]);
    failSecond = false;
    await engine.resume(started.record.jobId, LATER);
    const resumed = await engine.runBatch(started.record.jobId, "2026-09-21T16:20:00.000Z");
    expect(resumed.state).toBe("COMPLETE");
    expect(intelligence.listDailyHistory()).toHaveLength(2);
    expect(intelligence.listDailyHistory().filter((row) => row.securityId === first.securityId)).toHaveLength(1);
  });

  it("6/7. point-in-time symbol is used, and a reused symbol stays on its own security", async () => {
    const identity = createSecurityIdentityStore();
    const original = identity.resolve(identityInput({ symbol: "OLD", figi: "BBG0000000AA", effectiveDate: "2020-01-15" }));
    identity.resolve(identityInput({ symbol: "NEW", figi: "BBG0000000AA", effectiveDate: "2022-03-01" }));
    const reused = identity.resolve(identityInput({
      symbol: "OLD",
      figi: "BBG0000000BB",
      effectiveDate: "2024-01-02",
      issuerName: "Different Issuer",
    }));
    const intelligence = createSecurityIntelligenceStore();
    const requested: string[] = [];
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: {
        fetchDailyBars: async (request) => {
          requested.push(`${request.securityId}:${request.symbol}:${request.dateFrom}`);
          return supported([bar(request.dateFrom)]);
        },
      },
      config: { dateChunkDays: 2000, maxChunksPerRun: 4, retryCount: 0 },
    });
    const started = await engine.start({
      securities: [{ securityId: original.securityId! }, { securityId: reused.securityId! }],
      completedSessionDate: "2024-06-03",
      dateFrom: "2021-06-01",
      dateTo: "2024-06-03",
      recordedAt: RECORDED,
    });
    if (!started.ok) throw new Error(started.reason);
    await engine.runBatch(started.record.jobId, LATER);
    expect(requested.some((call) => call.includes(`${original.securityId}:OLD:2021-06-01`))).toBe(true);
    expect(requested.some((call) => call.startsWith(`${original.securityId}:NEW:`))).toBe(true);
    const oldRow = intelligence.getDailyHistory(original.securityId!, "2021-06-01");
    const reusedRow = intelligence.listDailyHistory().find((row) => row.securityId === reused.securityId && row.observedSymbol === "OLD");
    expect(oldRow?.observedSymbol).toBe("OLD");
    expect(oldRow?.securityId).not.toBe(reused.securityId);
    expect(reusedRow?.securityId).toBe(reused.securityId);
    expect(identity.currentSymbol(original.securityId!)?.symbol).toBe("NEW");
  });

  it("8/9/10. invalid bars are dropped, and dollar volume and previous-close move derive when valid", () => {
    const securityId = "11111111-1111-4111-8111-111111111111";
    const base = {
      securityId,
      observedSymbol: "AAA",
      exchange: "NASDAQ",
      source: "fixture",
      sourceAsOf: null,
      fetchedAt: null,
      computedAt: RECORDED,
    };
    const invalid = [
      normalizeDailyBar({ ...base, previousClose: null, bar: { ...bar("2024-06-03"), close: Number.NaN } }),
      normalizeDailyBar({ ...base, previousClose: null, bar: { ...bar("2024-06-03"), volume: -1 } }),
      normalizeDailyBar({ ...base, previousClose: null, bar: { ...bar("2024-06-03"), high: 9, low: 11 } }),
      normalizeDailyBar({ ...base, previousClose: null, bar: { ...bar("2024-06-03"), close: null } }),
    ];
    expect(invalid.every((result) => result.ok === false)).toBe(true);
    const derived = normalizeDailyBar({
      ...base,
      previousClose: 10,
      bar: bar("2024-06-04", 12, 1000, 10),
    });
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.bar.dollarVolume).toBe(12000);
    expect(derived.bar.dollarVolumeValue?.qualityState).toBe("DERIVED");
    expect(derived.bar.dollarVolumeValue?.provenance).toBe("DERIVED");
    expect(derived.bar.dollarVolumeValue?.lineage?.inputs).toEqual(["price", "volume"]);
    expect(derived.bar.movePct).toBe(20);
    expect(derived.bar.movePctValue?.qualityState).toBe("DERIVED");
    expect(derived.bar.previousClose).toBe(10);
    const missingPrior = normalizeDailyBar({ ...base, previousClose: null, bar: bar("2024-06-03", 12, 1000, 10) });
    expect(missingPrior.ok && missingPrior.bar.movePct).toBe(null);
  });

  it("11/12. historical RVOL excludes the current session and is null without enough history", () => {
    const prior = Array.from({ length: 20 }, (_, index) => ({
      sessionDate: addCalendarDays("2024-01-01", index),
      volume: 100,
    }));
    const withCurrent = [...prior, { sessionDate: "2024-02-01", volume: 10_000 }];
    expect(historicalDailyRvol(withCurrent, "2024-02-01", 500, 20)).toBe(5);
    expect(historicalDailyRvol(prior.slice(0, 19), "2024-02-01", 500, 20)).toBeNull();
    expect(historicalDailyRvol(withCurrent, "2024-02-01", null, 20)).toBeNull();
    const rolling = createRollingDailyRvol(20);
    const samples = [100, null, 80.5, 0, -1, 120.25, 90, 110.5, 130, 70.75, 60, 140.125, 150, 95.5, 88, 77.25, 66.5, 55, 44.125, 33.5, 22.25, 500.5, 10];
    const seen: Array<{ sessionDate: string; volume: number | null }> = [];
    samples.forEach((volume, index) => {
      const sessionDate = addCalendarDays("2024-01-01", index);
      seen.push({ sessionDate, volume });
      expect(rolling.observe(volume)).toBe(historicalDailyRvol(seen, sessionDate, volume, 20));
    });
  });

  it("13/14/15. detector tiers persist only above normal, and significant or extreme episodes are queued", async () => {
    const flat = detectDailyEpisode({
      open: 10, high: 10.2, low: 9.9, close: 10.1, movePct: 1, dollarVolume: 1000, rvol: null, previousClose: 10,
    }, CONFIG);
    const notable = detectDailyEpisode({
      open: 10, high: 11.2, low: 10, close: 11.2, movePct: 12, dollarVolume: 1000, rvol: null, previousClose: 10,
    }, CONFIG);
    const significant = detectDailyEpisode({
      open: 10, high: 13, low: 10, close: 13, movePct: 30, dollarVolume: 1000, rvol: null, previousClose: 10,
    }, CONFIG);
    const extreme = detectDailyEpisode({
      open: 10, high: 16, low: 10, close: 16, movePct: 60, dollarVolume: 1000, rvol: null, previousClose: 10,
    }, CONFIG);
    expect([flat.tier, notable.tier, significant.tier, extreme.tier]).toEqual([
      "NORMAL",
      "NOTABLE",
      "SIGNIFICANT",
      "EXTREME",
    ]);

    const { identity, securityId } = listedSecurity();
    const intelligence = createSecurityIntelligenceStore();
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: {
        fetchDailyBars: async (request) => supported([
          bar("2024-06-03", 10, 1000, 10),
          bar("2024-06-04", 10.1, 1000, 10),
          bar("2024-06-05", 16, 1000, 10),
        ].filter((row) => row.sessionDate >= request.dateFrom && row.sessionDate <= request.dateTo)),
      },
      config: { dateChunkDays: 10, maxChunksPerRun: 2, retryCount: 0 },
    });
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: "2024-06-05",
      dateFrom: "2024-06-03",
      dateTo: "2024-06-05",
      recordedAt: RECORDED,
    });
    if (!started.ok) throw new Error(started.reason);
    const stats = engine.runBatch(started.record.jobId, LATER);
    return stats.then((result) => {
      expect(intelligence.listEpisodes().map((episode) => episode.tier)).toEqual(["EXTREME"]);
      expect(intelligence.listEpisodes()[0]).toMatchObject({
        origin: "HISTORICAL_BACKFILL",
        detectedBy: "HISTORICAL_DAILY_V1",
        floatTurnover: null,
        haltCount: null,
        closeStrength: null,
        rvol: null,
      });
      expect((result.episodesByTier as Record<string, number | undefined>).NORMAL).toBeUndefined();
      expect(result.deepReconstruction.map((item) => item.tier)).toEqual(["EXTREME"]);
      expect(result.episodesByTier.NOTABLE).toBe(0);
    });
  });

  it("16. partial provider coverage is not marked complete", async () => {
    const { identity, securityId } = listedSecurity();
    const intelligence = createSecurityIntelligenceStore();
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: {
        fetchDailyBars: async () => ({
          coverage: "ENTITLEMENT_UNKNOWN",
          bars: [bar("2024-06-03")],
          source: "fixture",
          sourceAsOf: null,
          fetchedAt: null,
          error: "historical depth not verified",
          complete: false,
        }),
      },
      config: { retryCount: 0 },
    });
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: "2024-06-03",
      dateFrom: "2021-09-01",
      dateTo: "2024-06-03",
      recordedAt: RECORDED,
    });
    if (!started.ok) throw new Error(started.reason);
    const stats = await engine.runBatch(started.record.jobId, LATER);
    expect(stats.state).toBe("PAUSED");
    expect(stats.state).not.toBe("COMPLETE");
    expect(stats.coverage).toBe("ENTITLEMENT_UNKNOWN");
    expect(intelligence.listDailyHistory()).toHaveLength(0);
    expect(stats.cursorToken).toBe("0:2021-09-01");
  });

  it("17. polygon chunking and pagination keep more than 365 daily records", async () => {
    const dateFrom = "2021-09-01";
    const dateTo = addCalendarDays(dateFrom, 399);
    let aggregateCalls = 0;
    const adapter = createPolygonDailyAdapter({
      maxDaysPerRequest: 100,
      fetchAggregates: async (_ticker, multiplier, timespan, from, to) => {
        aggregateCalls += 1;
        expect(multiplier).toBe(1);
        expect(timespan).toBe("day");
        const results = [];
        for (let cursor = from; cursor <= to; cursor = addCalendarDays(cursor, 1)) {
          results.push({ t: Date.parse(`${cursor}T00:00:00.000Z`), o: 10, h: 11, l: 9, c: 10, v: 100 });
        }
        return { results };
      },
    });
    const chunked = await adapter.fetchDailyBars({
      securityId: "11111111-1111-4111-8111-111111111111",
      symbol: "AAA",
      exchange: "NASDAQ",
      dateFrom,
      dateTo,
    });
    expect(chunked.bars.length).toBe(400);
    expect(aggregateCalls).toBe(4);
    expect(chunked.complete).toBe(true);
    expect(chunked.coverage).toBe("SUPPORTED");

    const paged = createPolygonDailyAdapter({
      fetchAggregates: async () => ({
        results: Array.from({ length: 365 }, (_, index) => ({
          t: Date.parse(`${addCalendarDays("2020-01-01", index)}T00:00:00.000Z`),
          o: 10, h: 11, l: 9, c: 10, v: 1,
        })),
        next_url: "page-2",
      }),
      fetchNextPage: async () => ({
        results: Array.from({ length: 10 }, (_, index) => ({
          t: Date.parse(`${addCalendarDays("2021-01-01", index)}T00:00:00.000Z`),
          o: 10, h: 11, l: 9, c: 10, v: 1,
        })),
      }),
    });
    const pages = await paged.fetchDailyBars({
      securityId: "11111111-1111-4111-8111-111111111111",
      symbol: "AAA",
      exchange: null,
      dateFrom: "2020-01-01",
      dateTo: "2020-01-10",
    });
    expect(pages.bars.length).toBe(375);
    expect(pages.coverage).toBe("SUPPORTED");

    let fullRangeCalls = 0;
    const fullRange = createPolygonDailyAdapter({
      verifiedEarliestDailyDate: "2021-09-22",
      fetchAggregates: async (_ticker, _multiplier, _timespan, from, to) => {
        fullRangeCalls += 1;
        expect(from).toBe("2021-09-22");
        expect(to).toBe("2026-09-18");
        return {
          status: "OK",
          queryCount: 2,
          resultsCount: 2,
          results: [
            { t: Date.parse("2021-09-22T00:00:00.000Z"), o: 10, h: 11, l: 9, c: 10, v: 100 },
            { t: Date.parse("2026-09-18T00:00:00.000Z"), o: 10, h: 11, l: 9, c: 12, v: 100 },
          ],
        };
      },
    });
    const wide = await fullRange.fetchDailyBars({
      securityId: "11111111-1111-4111-8111-111111111111",
      symbol: "AAA",
      exchange: null,
      dateFrom: "2021-09-22",
      dateTo: "2026-09-18",
    });
    expect(fullRangeCalls).toBe(1);
    expect(wide.complete).toBe(true);
    expect(wide.bars).toHaveLength(2);

    let blockedCalls = 0;
    const blocked = createPolygonDailyAdapter({
      verifiedEarliestDailyDate: "2021-09-22",
      fetchAggregates: async () => {
        blockedCalls += 1;
        return { results: [] };
      },
    });
    const tooEarly = await blocked.fetchDailyBars({
      securityId: "11111111-1111-4111-8111-111111111111",
      symbol: "AAA",
      exchange: null,
      dateFrom: "2021-09-01",
      dateTo: "2021-09-22",
    });
    expect(blockedCalls).toBe(0);
    expect(tooEarly.complete).toBe(false);
    expect(tooEarly.coverage).toBe("UNAVAILABLE");
  });

  it("18. provider retry and backoff stay bounded", async () => {
    const sleeps: number[] = [];
    let calls = 0;
    await expect(withBoundedRetry(
      async () => {
        calls += 1;
        throw new Error("temporary");
      },
      { retryCount: 2, retryBackoffMs: 10, sleep: async (ms) => { sleeps.push(ms); } },
    )).rejects.toThrow("temporary");
    expect(calls).toBe(3);
    expect(sleeps).toEqual([10, 20]);

    const { identity, securityId } = listedSecurity();
    const intelligence = createSecurityIntelligenceStore();
    let attempts = 0;
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      sleep: async () => undefined,
      provider: {
        fetchDailyBars: async (request) => {
          attempts += 1;
          if (attempts < 3) throw new Error("temporary");
          return supported([bar(request.dateFrom)]);
        },
      },
      config: { retryCount: 2, retryBackoffMs: 5, dateChunkDays: 1, maxChunksPerRun: 1 },
    });
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: "2024-06-03",
      dateFrom: "2024-06-03",
      dateTo: "2024-06-03",
      recordedAt: RECORDED,
    });
    if (!started.ok) throw new Error(started.reason);
    const stats = await engine.runBatch(started.record.jobId, LATER);
    expect(attempts).toBe(3);
    expect(stats.rowsWritten).toBe(1);
    expect(stats.state).toBe("COMPLETE");
  });

  it("19. Radar and screener behavior stays unchanged", () => {
    const untouched = [
      "src/lib/screeners/radar-v2-adapter.ts",
      "src/lib/screeners/resolve-rvol20d.ts",
      "src/components/dashboard/ScreenerTable.tsx",
      "src/features/day-trade-radar-v2/RadarGrid.tsx",
    ];
    for (const file of untouched) {
      expect(readFileSync(file, "utf8")).not.toMatch(/historical-backfill/);
    }
    expect(readFileSync("src/lib/historical-backfill/engine.ts", "utf8")).not.toMatch(/getAggregates|fetchMarketData/);
    const louder: RadarV2CandidateRow = {
      symbol: "LOUD",
      generation_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      trading_date: "2026-09-03",
      session_kind: "market",
      lifecycle: "ACTIVE",
      signal_status: "EXPLOSIVE",
      last_price: 10,
      move_15s_pct: 1,
      move_60s_pct: 1,
      volume_5s: 1,
      volume_15s: 1,
      volume_60s: 1,
      session_volume: 50,
      dollar_volume_60s: 1,
      acceleration_5m: 0,
      rvol_5m: null,
      volume_velocity: null,
      volume_acceleration_pct: null,
      primary_scanner_event: null,
      primary_scanner_event_at: null,
      scanner_events: null,
      session_high: 11,
      session_low: 9,
      distance_from_hod_pct: 1,
      session_vwap: 10,
      vwap_side: "above",
      freshness_class: "fresh",
      provider_as_of: "2026-09-03T14:00:00.000Z",
      updated_at: "2026-09-03T14:00:00.000Z",
    };
    expect(compareCandidatesVolumeFirst({ ...louder, symbol: "QUIET", session_volume: 5 }, louder)).toBeGreaterThan(0);
  });
});
