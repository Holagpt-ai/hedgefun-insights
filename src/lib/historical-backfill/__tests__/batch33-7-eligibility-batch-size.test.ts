import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HISTORICAL_CATCHUP_DEFAULT_ELIGIBILITY_BATCH_SIZE,
  HISTORICAL_CATCHUP_ELIGIBILITY_BATCH_SIZE_ENV,
  HISTORICAL_CATCHUP_LIMITS,
  HISTORICAL_CATCHUP_PREFLIGHT_ENV,
  HISTORICAL_CATCHUP_RESUME_ONLY_ENV,
  HistoricalCatchupLimitsError,
  effectiveEligibilityBatchSize,
  isHistoricalCatchupResumeOnlyEnabled,
  readHistoricalCatchupEligibilityBatchSizeFromEnv,
} from "@/config/historical-catchup.config";
import {
  resolveEligibilityTrancheSize,
  resumeInterruptedJobById,
  runHistoricalCatchUpPreflight,
} from "@/lib/historical-backfill/production-rollout";
import {
  ProviderRequestBudget,
} from "@/lib/historical-backfill/provider-request-budget";
import { HistoricalBackfillEngine } from "@/lib/historical-backfill/engine";
import type { HistoricalPersistence } from "@/lib/persistence/historical-persistence";
import { createSecurityIdentityStore } from "@/lib/security-identity/security-identity";
import { createSecurityIntelligenceStore } from "@/lib/security-intelligence/security-intelligence";
import type { DailyBarsResult, ProviderDailyBar } from "@/types/historical-backfill";

const AFTER_CLOSE = new Date("2026-10-21T21:00:00.000Z");

function bar(sessionDate: string): ProviderDailyBar {
  return { sessionDate, open: 10, high: 11, low: 9, close: 10, volume: 1_000_000 };
}

describe("Batch 33.7 eligibility batch size", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults eligibility batch size to 100 when unset", () => {
    expect(readHistoricalCatchupEligibilityBatchSizeFromEnv({ get: () => undefined })).toBe(100);
    expect(HISTORICAL_CATCHUP_DEFAULT_ELIGIBILITY_BATCH_SIZE).toBe(100);
  });

  it("reads configured eligibility batch size 150", () => {
    vi.stubEnv(HISTORICAL_CATCHUP_ELIGIBILITY_BATCH_SIZE_ENV, "150");
    expect(readHistoricalCatchupEligibilityBatchSizeFromEnv()).toBe(150);
  });

  it("rejects invalid eligibility batch size values", () => {
    expect(() =>
      readHistoricalCatchupEligibilityBatchSizeFromEnv({ get: () => "0" }),
    ).toThrow(HistoricalCatchupLimitsError);
    expect(() =>
      readHistoricalCatchupEligibilityBatchSizeFromEnv({ get: () => "-1" }),
    ).toThrow(HistoricalCatchupLimitsError);
    expect(() =>
      readHistoricalCatchupEligibilityBatchSizeFromEnv({ get: () => "1.5" }),
    ).toThrow(HistoricalCatchupLimitsError);
    expect(() =>
      readHistoricalCatchupEligibilityBatchSizeFromEnv({ get: () => "abc" }),
    ).toThrow(HistoricalCatchupLimitsError);
  });

  it("caps first tranche by max symbols per run", () => {
    const limits = { ...HISTORICAL_CATCHUP_LIMITS, maxSymbolsPerRun: 150 };
    expect(effectiveEligibilityBatchSize(200, limits.maxSymbolsPerRun)).toBe(150);
    expect(
      resolveEligibilityTrancheSize({
        batchesRun: 0,
        eligibilityBatchSize: 200,
        limits,
        symbolsAttempted: 0,
      }),
    ).toBe(150);
  });

  it("selects 150 symbols on first batch when configured and within max", () => {
    const limits = { ...HISTORICAL_CATCHUP_LIMITS, maxSymbolsPerRun: 150 };
    expect(
      resolveEligibilityTrancheSize({
        batchesRun: 0,
        eligibilityBatchSize: 150,
        limits,
        symbolsAttempted: 0,
      }),
    ).toBe(150);
  });

  it("preserves eligible symbol ordering via head slice", () => {
    const eligible = ["AAA", "BBB", "CCC", "DDD", "EEE"];
    const size = resolveEligibilityTrancheSize({
      batchesRun: 0,
      eligibilityBatchSize: 3,
      limits: { ...HISTORICAL_CATCHUP_LIMITS, maxSymbolsPerRun: 600 },
      symbolsAttempted: 0,
    });
    expect(eligible.slice(0, size)).toEqual(["AAA", "BBB", "CCC"]);
  });

  it("honors remaining symbol budget on later batches", () => {
    const limits = { ...HISTORICAL_CATCHUP_LIMITS, maxSymbolsPerRun: 150, maxBatchesPerRun: 2 };
    expect(
      resolveEligibilityTrancheSize({
        batchesRun: 1,
        eligibilityBatchSize: 150,
        limits,
        symbolsAttempted: 120,
      }),
    ).toBe(30);
  });

  it("preflight reports configured eligibility batch size", async () => {
    vi.stubEnv(HISTORICAL_CATCHUP_ELIGIBILITY_BATCH_SIZE_ENV, "150");
    const result = await runHistoricalCatchUpPreflight({
      targetSession: "2026-10-20",
      now: AFTER_CLOSE,
      limits: { ...HISTORICAL_CATCHUP_LIMITS, maxSymbolsPerRun: 150, maxBatchesPerRun: 1 },
    });
    expect(result.eligibilityBatchSize).toBe(150);
  });

  it("preflight-only env does not enable resume-only", () => {
    vi.stubEnv(HISTORICAL_CATCHUP_PREFLIGHT_ENV, "1");
    vi.stubEnv(HISTORICAL_CATCHUP_RESUME_ONLY_ENV, "1");
    expect(isHistoricalCatchupResumeOnlyEnabled()).toBe(true);
  });

  it("resume-only path does not use eligibility batch selection", async () => {
    const identity = createSecurityIdentityStore();
    const created = identity.resolve({
      symbol: "RONLY",
      exchange: "NASDAQ",
      effectiveDate: "2021-09-22",
      source: "reference-feed",
      provenance: "PROVIDER",
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    const intelligence = createSecurityIntelligenceStore();
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: {
        fetchDailyBars: async (request): Promise<DailyBarsResult> => ({
          coverage: "SUPPORTED",
          bars: [bar(request.dateFrom)],
          source: "fixture",
          sourceAsOf: null,
          fetchedAt: null,
          error: null,
          complete: true,
        }),
      },
      config: { dateChunkDays: 5000, maxChunksPerRun: 5, retryCount: 0 },
    });
    const started = await engine.start({
      securities: [{ securityId: created.securityId! }],
      completedSessionDate: "2026-10-20",
      dateFrom: "2021-09-22",
      dateTo: "2026-10-20",
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    if (!started.ok) throw new Error(started.reason);
    await intelligence.transitionBackfillJob(started.record.jobId, {
      to: "PAUSED",
      recordedAt: "2026-10-21T16:01:00.000Z",
    });
    const loadEligibleSymbols = vi.fn(async () => ["NEVER"]);
    const persistence = {
      transport: "postgres",
      identity,
      intelligence,
      rollout: {
        findInterruptedJob: async () => null,
        loadBackfilledSymbols: async () => new Set(),
        loadSymbolSessionCoverage: async () => [],
        loadEligibleSymbols,
      },
      close: async () => undefined,
    } as unknown as HistoricalPersistence;
    await resumeInterruptedJobById(
      engine,
      persistence,
      started.record.jobId,
      { ...HISTORICAL_CATCHUP_LIMITS, maxProviderRequestsPerRun: 500 },
      { dailyRequests: 0, referenceRequests: 0, http403: 0, http429: 0, nextPages: 0 },
      new ProviderRequestBudget(500),
    );
    expect(loadEligibleSymbols).not.toHaveBeenCalled();
  });

  it("provider budget still caps interrupted job advancement", async () => {
    const identity = createSecurityIdentityStore();
    const created = identity.resolve({
      symbol: "BUD",
      exchange: "NASDAQ",
      effectiveDate: "2021-09-22",
      source: "reference-feed",
      provenance: "PROVIDER",
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    const intelligence = createSecurityIntelligenceStore();
    const budget = new ProviderRequestBudget(1);
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: {
        fetchDailyBars: async (request) => {
          budget.consumeBeforeRequest();
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
      config: { dateChunkDays: 1, maxChunksPerRun: 5, retryCount: 0 },
    });
    const started = await engine.start({
      securities: [{ securityId: created.securityId! }],
      completedSessionDate: "2026-10-20",
      dateFrom: "2021-09-22",
      dateTo: "2026-10-20",
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    if (!started.ok) throw new Error("start failed");
    await engine.runBatch(started.record.jobId, "2026-10-21T16:01:00.000Z");
    const persistence = {
      transport: "postgres",
      identity,
      intelligence,
      rollout: {
        findInterruptedJob: async () => ({ jobId: started.record.jobId, state: "RUNNING" }),
        loadBackfilledSymbols: async () => new Set(),
        loadSymbolSessionCoverage: async () => [],
        loadEligibleSymbols: async () => [],
      },
      close: async () => undefined,
    } as unknown as HistoricalPersistence;
    const result = await resumeInterruptedJobById(
      engine,
      persistence,
      started.record.jobId,
      { ...HISTORICAL_CATCHUP_LIMITS, maxProviderRequestsPerRun: 1 },
      { dailyRequests: 0, referenceRequests: 0, http403: 0, http429: 0, nextPages: 0 },
      budget,
    );
    expect(result.stopReason).toBe("provider_request_limit");
  });
});
