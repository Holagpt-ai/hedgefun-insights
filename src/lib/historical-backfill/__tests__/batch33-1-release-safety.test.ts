import { describe, expect, it } from "vitest";
import {
  HistoricalCatchupLimitsError,
  readHistoricalCatchupLimitsFromEnv,
} from "@/config/historical-catchup.config";
import {
  catchUpRolloutEventName,
  resolveCatchUpRolloutOutcome,
} from "@/lib/historical-backfill/catch-up-rollout-outcome";
import { HistoricalBackfillEngine } from "@/lib/historical-backfill/engine";
import {
  ProviderBudgetExhaustedError,
  ProviderRequestBudget,
} from "@/lib/historical-backfill/provider-request-budget";
import {
  resumeInterruptedJobs,
  runHistoricalCatchUpPreflight,
} from "@/lib/historical-backfill/production-rollout";
import { HISTORICAL_CATCHUP_LIMITS } from "@/config/historical-catchup.config";
import type { HistoricalPersistence } from "@/lib/persistence/historical-persistence";
import { withBoundedRetry } from "@/lib/historical-backfill/retry";
import { createSecurityIdentityStore } from "@/lib/security-identity/security-identity";
import { createSecurityIntelligenceStore } from "@/lib/security-intelligence/security-intelligence";
import type { DailyBarsRequest, DailyBarsResult, ProviderDailyBar } from "@/types/historical-backfill";

const AFTER_CLOSE = new Date("2026-10-21T21:00:00.000Z");

function bar(sessionDate: string): ProviderDailyBar {
  return { sessionDate, open: 10, high: 11, low: 9, close: 10, volume: 1_000_000 };
}

function supported(bars: readonly ProviderDailyBar[]): DailyBarsResult {
  return {
    coverage: "SUPPORTED",
    bars,
    source: "fixture",
    sourceAsOf: "2026-10-21T20:00:00.000Z",
    fetchedAt: "2026-10-21T20:01:00.000Z",
    error: null,
    complete: true,
  };
}

function listed(symbol: string) {
  const identity = createSecurityIdentityStore();
  const created = identity.resolve({
    symbol,
    exchange: "NASDAQ",
    effectiveDate: "2020-01-02",
    source: "reference-feed",
    provenance: "PROVIDER",
    recordedAt: "2026-10-21T16:00:00.000Z",
  });
  return { identity, securityId: created.securityId! };
}

describe("Batch 33.1 release-safety", () => {
  it("preserves providerStarts across checkpoints for multiple securities", async () => {
    const identity = createSecurityIdentityStore();
    const idA = identity.resolve({
      symbol: "MSA",
      exchange: "NASDAQ",
      effectiveDate: "2020-01-02",
      source: "reference-feed",
      provenance: "PROVIDER",
      recordedAt: "2026-10-21T16:00:00.000Z",
    }).securityId!;
    const idB = identity.resolve({
      symbol: "MSB",
      exchange: "NASDAQ",
      effectiveDate: "2020-01-02",
      source: "reference-feed",
      provenance: "PROVIDER",
      recordedAt: "2026-10-21T16:00:00.000Z",
    }).securityId!;
    const intelligence = createSecurityIntelligenceStore();
    const requestedFrom: string[] = [];
    const providerStarts = { [idA]: "2026-09-19", [idB]: "2026-10-01" };

    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: {
        fetchDailyBars: async (request: DailyBarsRequest) => {
          requestedFrom.push(`${request.securityId}:${request.dateFrom}`);
          return supported([bar(request.dateFrom)]);
        },
      },
      config: { dateChunkDays: 1, maxChunksPerRun: 1, retryCount: 0 },
    });

    const started = await engine.start({
      securities: [{ securityId: idA }, { securityId: idB }],
      completedSessionDate: "2026-10-20",
      dateFrom: "2026-09-19",
      dateTo: "2026-10-20",
      recordedAt: "2026-10-21T16:00:00.000Z",
      providerStarts,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    await engine.runBatch(started.record.jobId, "2026-10-21T16:01:00.000Z");
    const afterFirst = await intelligence.getJob(started.record.jobId);
    expect(afterFirst?.metadata?.providerStarts).toEqual(providerStarts);

    await engine.runBatch(started.record.jobId, "2026-10-21T16:02:00.000Z");
    const afterSecond = await intelligence.getJob(started.record.jobId);
    expect(afterSecond?.metadata?.providerStarts).toEqual(providerStarts);

    while ((await engine.stats(started.record.jobId, "2026-10-21T16:03:00.000Z")).state === "RUNNING") {
      await engine.runBatch(started.record.jobId, "2026-10-21T16:04:00.000Z");
    }

    expect(requestedFrom.some((row) => row.startsWith(`${idA}:2026-09-19`))).toBe(true);
    expect(requestedFrom.some((row) => row.startsWith(`${idB}:2026-10-01`))).toBe(true);
  });

  it("stops engine batches when provider budget is exhausted (resumable RUNNING)", async () => {
    const { identity, securityId } = listed("BUD");
    const intelligence = createSecurityIntelligenceStore();
    const budget = new ProviderRequestBudget(2);
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: {
        fetchDailyBars: async (request) => supported([bar(request.dateFrom)]),
      },
      config: { dateChunkDays: 1, maxChunksPerRun: 5, retryCount: 1, retryBackoffMs: 0 },
      providerRequestBudget: budget,
      sleep: async () => undefined,
    });

    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: "2026-09-22",
      dateFrom: "2026-09-19",
      dateTo: "2026-09-22",
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    if (!started.ok) throw new Error("start failed");
    const stats = await engine.runBatch(started.record.jobId, "2026-10-21T16:01:00.000Z");
    expect(stats.state).toBe("RUNNING");
    expect(budget.used).toBe(2);
    const job = await intelligence.getJob(started.record.jobId);
    expect(job?.metadata?.providerStarts).toBeDefined();
  });

  it("charges budget on each retry attempt before the provider call", async () => {
    const budget = new ProviderRequestBudget(3);
    let attempts = 0;
    await expect(
      withBoundedRetry(
        async () => {
          attempts += 1;
          throw new Error("transient");
        },
        {
          retryCount: 2,
          retryBackoffMs: 0,
          sleep: async () => undefined,
          beforeAttempt: () => budget.consumeBeforeRequest(),
        },
      ),
    ).rejects.toThrow("transient");
    expect(attempts).toBe(3);
    expect(budget.used).toBe(3);
    expect(() => budget.consumeBeforeRequest()).toThrow(ProviderBudgetExhaustedError);
  });

  it("rejects malformed and excessive catch-up limit env values", () => {
    expect(() => readHistoricalCatchupLimitsFromEnv({
      get: (name) => (name === "HISTORICAL_CATCHUP_MAX_BATCHES" ? "abc" : undefined),
    })).toThrow(HistoricalCatchupLimitsError);

    expect(() => readHistoricalCatchupLimitsFromEnv({
      get: (name) => (name === "HISTORICAL_CATCHUP_MAX_SYMBOLS" ? "999999" : undefined),
    })).toThrow(HistoricalCatchupLimitsError);
  });

  it("distinguishes partial stop from rollout complete", () => {
    expect(resolveCatchUpRolloutOutcome({
      stopReason: "none",
      eligibleSymbolsRemaining: 0,
      interruptedJobId: null,
    })).toBe("complete");
    expect(catchUpRolloutEventName("complete")).toBe("rollout_complete");

    expect(resolveCatchUpRolloutOutcome({
      stopReason: "fly_run_limits",
      eligibleSymbolsRemaining: 100,
      interruptedJobId: "job-1",
    })).toBe("partial");
    expect(catchUpRolloutEventName("partial")).toBe("catch_up_partial_stop");
  });

  it("resumeInterruptedJobs respects per-run provider budget", async () => {
    const { identity, securityId } = listed("RSM");
    const intelligence = createSecurityIntelligenceStore();
    const budget = new ProviderRequestBudget(1);
    const counters = {
      dailyRequests: 0,
      referenceRequests: 0,
      http403: 0,
      http429: 0,
      nextPages: 0,
    };
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: {
        fetchDailyBars: async (request) => supported([bar(request.dateFrom)]),
      },
      config: { dateChunkDays: 1, maxChunksPerRun: 5, retryCount: 0 },
      providerRequestBudget: budget,
    });
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: "2026-09-22",
      dateFrom: "2026-09-19",
      dateTo: "2026-09-22",
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
        loadBackfilledSymbols: async () => new Set<string>(),
        loadSymbolSessionCoverage: async () => [],
        loadEligibleSymbols: async () => [],
      },
      close: async () => undefined,
    } as HistoricalPersistence;

    const limits = { ...HISTORICAL_CATCHUP_LIMITS, maxProviderRequestsPerRun: 1 };
    const result = await resumeInterruptedJobs(
      engine,
      persistence,
      "2026-09-19",
      "2026-09-22",
      limits,
      counters,
      budget,
    );
    expect(result.blockNewJobs).toBe(true);
    expect(result.stopReason).toBe("provider_request_limit");
  });

  it("preflight validates target and limits without persistence", async () => {
    const result = await runHistoricalCatchUpPreflight({
      targetSession: "2026-10-20",
      now: AFTER_CLOSE,
      limits: readHistoricalCatchupLimitsFromEnv({ get: () => undefined }),
    });
    expect(result.targetSession).toBe("2026-10-20");
    expect(result.limits.maxBatchesPerRun).toBeGreaterThan(0);
  });
});
