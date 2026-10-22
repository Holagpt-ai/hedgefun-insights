import { describe, expect, it } from "vitest";
import { HistoricalBackfillEngine } from "@/lib/historical-backfill/engine";
import { planSegmentWithEntitlementFloor } from "@/lib/historical-backfill/entitlement-segments";
import { createSecurityIdentityStore } from "@/lib/security-identity/security-identity";
import { createSecurityIntelligenceStore } from "@/lib/security-intelligence/security-intelligence";
import type { DailyBarsResult } from "@/types/historical-backfill";
import type { SecurityIdentityObservation } from "@/types/security-identity";

const RECORDED = "2026-10-22T12:00:00.000Z";
const LATER = "2026-10-22T12:05:00.000Z";

function identityInput(overrides: Partial<SecurityIdentityObservation>): SecurityIdentityObservation {
  return {
    symbol: "AAA",
    exchange: "XASE",
    effectiveDate: "2020-01-02",
    source: "reference-feed",
    provenance: "PROVIDER",
    recordedAt: RECORDED,
    ...overrides,
  };
}

function bar(sessionDate: string) {
  return {
    sessionDate,
    open: 10,
    high: 11,
    low: 9,
    close: 10,
    volume: 100,
  };
}

describe("Batch 33.5 release safety", () => {
  it("records OBE entitlement gap then fetches OBEL without synthetic OHLCV on the gap", async () => {
    const identity = createSecurityIdentityStore();
    const figi = "BBG0000000OBE";
    const original = identity.resolve(identityInput({
      symbol: "OBE",
      figi,
      effectiveDate: "2005-06-03",
    }));
    identity.resolve(identityInput({
      symbol: "OBEL",
      figi,
      effectiveDate: "2021-09-23",
    }));
    const securityId = original.securityId;
    if (!securityId) throw new Error("resolve failed");
    const intelligence = createSecurityIntelligenceStore();
    const calls: string[] = [];
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: {
        fetchDailyBars: async (request): Promise<DailyBarsResult> => {
          calls.push(`${request.symbol}:${request.dateFrom}:${request.dateTo}`);
          if (request.symbol === "OBE") {
            return {
              coverage: "UNAVAILABLE",
              bars: [],
              source: "fixture",
              sourceAsOf: null,
              fetchedAt: null,
              error: "Your plan doesn't include this data timeframe",
              complete: false,
              failureKind: "PROVIDER_ENTITLEMENT_TIMEFRAME",
              providerDiagnostics: {
                httpStatus: 403,
                providerStatus: "NOT_AUTHORIZED",
                providerMessage: "Your plan doesn't include this data timeframe",
                requestId: "req-obe",
              },
            };
          }
          return {
            coverage: "SUPPORTED",
            bars: [bar(request.dateFrom)],
            source: "fixture",
            sourceAsOf: null,
            fetchedAt: null,
            error: null,
            complete: true,
          };
        },
      },
      config: { retryCount: 0, dateChunkDays: 5000 },
    });
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: "2021-09-23",
      dateFrom: "2021-09-22",
      dateTo: "2021-09-23",
      recordedAt: RECORDED,
    });
    if (!started.ok) throw new Error(started.reason);
    const stats = await engine.runBatch(started.record.jobId, LATER);
    expect(stats.state).toBe("COMPLETE");
    expect(calls).toEqual(["OBE:2021-09-22:2021-09-22", "OBEL:2021-09-23:2021-09-23"]);
    expect(intelligence.listCoverageGaps(securityId)).toMatchObject([
      {
        observedSymbol: "OBE",
        dateFrom: "2021-09-22",
        dateTo: "2021-09-22",
        restrictionReason: "PROVIDER_ENTITLEMENT_TIMEFRAME",
      },
    ]);
    expect(intelligence.listDailyHistory()).toHaveLength(1);
    expect(intelligence.listDailyHistory()[0]?.observedSymbol).toBe("OBEL");
    expect(intelligence.listDailyHistory().some((row) => row.observedSymbol === "OBE")).toBe(false);
  });

  it("coverage gap upsert is idempotent", () => {
    const intelligence = createSecurityIntelligenceStore();
    const input = {
      securityId: "11111111-1111-4111-8111-111111111111",
      observedSymbol: "AAA",
      dateFrom: "2021-09-01",
      dateTo: "2021-09-10",
      provider: "polygon-aggregates",
      restrictionReason: "CONFIG_ENTITLEMENT_FLOOR" as const,
      coverageState: "ENTITLEMENT_RESTRICTED" as const,
      observedAt: RECORDED,
    };
    const first = intelligence.upsertCoverageGap(input);
    const second = intelligence.upsertCoverageGap(input);
    expect(first.ok && second.ok).toBe(true);
    if (second.ok) expect(second.noop).toBe(true);
    expect(intelligence.listCoverageGaps()).toHaveLength(1);
  });

  it("resume preserves checkpoint cursor for paused C2-shaped job metadata", async () => {
    const identity = createSecurityIdentityStore();
    const intelligence = createSecurityIntelligenceStore();
    const securityIds = Array.from({ length: 59 }, (_, index) =>
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    const checkpoint = {
      securityIndex: 34,
      nextChunkFrom: "2021-09-22",
      securitiesTotal: 59,
      securitiesProcessed: 34,
      sessionsProcessed: 0,
      rowsWritten: 25393,
      duplicateRows: 0,
      invalidRows: 0,
      providerErrors: 1,
      episodesByTier: { NOTABLE: 0, SIGNIFICANT: 0, EXTREME: 0 },
      coverage: "UNAVAILABLE",
      deepReconstruction: [],
      lastSuccessfulSecurityIndex: 34,
      lastSuccessfulChunkFrom: "2021-09-22",
    };
    const created = intelligence.createBackfillJob({
      jobType: "SECURITY_DAILY_HISTORY_CATCHUP",
      dateFrom: "2021-09-22",
      dateTo: "2026-10-20",
      recordedAt: RECORDED,
      metadata: { securityIds, checkpoint, providerStarts: {} },
    });
    if (!created.ok) throw new Error(created.reason);
    intelligence.transitionBackfillJob(created.record.jobId, {
      to: "RUNNING",
      recordedAt: RECORDED,
      cursorDate: "2021-09-22",
      cursorToken: "34:2021-09-22",
      processedCount: 34,
      errorCount: 1,
      metadata: { securityIds, checkpoint, providerStarts: {} },
    });
    intelligence.transitionBackfillJob(created.record.jobId, {
      to: "PAUSED",
      recordedAt: RECORDED,
      cursorDate: "2021-09-22",
      cursorToken: "34:2021-09-22",
      processedCount: 34,
      errorCount: 1,
      metadata: { securityIds, checkpoint, providerStarts: {} },
    });
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: {
        fetchDailyBars: async () => ({
          coverage: "SUPPORTED",
          bars: [],
          source: "fixture",
          sourceAsOf: null,
          fetchedAt: null,
          error: null,
          complete: true,
        }),
      },
      config: { retryCount: 0, maxChunksPerRun: 0 },
    });
    const resumed = await engine.resume(created.record.jobId, LATER);
    expect(resumed.ok).toBe(true);
    const job = intelligence.getJob(created.record.jobId);
    expect(job?.processedCount).toBe(34);
    expect(job?.cursorToken).toBe("34:2021-09-22");
    expect(job?.state).toBe("RUNNING");
  });

  it("config floor records pre-floor span without fetch when segment ends before floor", () => {
    const planned = planSegmentWithEntitlementFloor(
      { symbol: "OBE", exchange: "XASE", dateFrom: "2021-09-22", dateTo: "2021-09-22" },
      "2024-10-22",
    );
    expect(planned).toEqual([
      {
        kind: "config_entitlement_gap",
        symbol: "OBE",
        exchange: "XASE",
        dateFrom: "2021-09-22",
        dateTo: "2021-09-22",
      },
    ]);
  });
});
