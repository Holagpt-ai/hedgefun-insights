import { describe, expect, it } from "vitest";
import { HistoricalBackfillEngine } from "@/lib/historical-backfill/engine";
import { createPolygonDailyAdapter } from "@/lib/historical-backfill/polygon-daily-adapter";
import {
  ProviderBudgetExhaustedError,
  ProviderRequestBudget,
} from "@/lib/historical-backfill/provider-request-budget";
import { createSecurityIdentityStore } from "@/lib/security-identity/security-identity";
import { createSecurityIntelligenceStore } from "@/lib/security-intelligence/security-intelligence";
import type { DailyBarsRequest, DailyBarsResult } from "@/types/historical-backfill";

function polygonBar(sessionDate: string) {
  const t = Date.parse(`${sessionDate}T16:00:00.000Z`);
  return { t, o: 10, h: 11, l: 9, c: 10, v: 1_000_000 };
}

function budgetedFetch(
  budget: ProviderRequestBudget,
  handler: (request: DailyBarsRequest) => Promise<DailyBarsResult> | DailyBarsResult,
) {
  return {
    fetchDailyBars: async (request: DailyBarsRequest) => {
      budget.consumeBeforeRequest();
      return handler(request);
    },
  };
}

describe("Batch 33.2 provider budget accounting", () => {
  it("allows exactly one HTTP attempt when budget is 1", async () => {
    const budget = new ProviderRequestBudget(1);
    let httpCalls = 0;
    const provider = createPolygonDailyAdapter({
      verifiedEarliestDailyDate: "2020-01-02",
      fetchAggregates: async () => {
        budget.consumeBeforeRequest();
        httpCalls += 1;
        return { status: "OK", results: [polygonBar("2026-09-19")] };
      },
    });
    const identity = createSecurityIdentityStore();
    const securityId = identity.resolve({
      symbol: "ONE",
      exchange: "NASDAQ",
      effectiveDate: "2020-01-02",
      source: "reference-feed",
      provenance: "PROVIDER",
      recordedAt: "2026-10-21T16:00:00.000Z",
    }).securityId!;
    const intelligence = createSecurityIntelligenceStore();
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider,
      config: { dateChunkDays: 1, maxChunksPerRun: 3, retryCount: 0 },
    });
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: "2026-09-21",
      dateFrom: "2026-09-19",
      dateTo: "2026-09-21",
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    if (!started.ok) throw new Error("start failed");
    const stats = await engine.runBatch(started.record.jobId, "2026-10-21T16:01:00.000Z");
    expect(httpCalls).toBe(1);
    expect(budget.used).toBe(1);
    expect(stats.state).toBe("RUNNING");
    expect(() => budget.consumeBeforeRequest()).toThrow(ProviderBudgetExhaustedError);
  });

  it("charges one unit per pagination page", async () => {
    const budget = new ProviderRequestBudget(2);
    let httpCalls = 0;
    const provider = createPolygonDailyAdapter({
      verifiedEarliestDailyDate: "2020-01-02",
      fetchAggregates: async () => {
        budget.consumeBeforeRequest();
        httpCalls += 1;
        return {
          status: "OK",
          results: [polygonBar("2026-09-19")],
          next_url: "https://api.polygon.io/v2/next",
        };
      },
      fetchNextPage: async () => {
        budget.consumeBeforeRequest();
        httpCalls += 1;
        return { status: "OK", results: [polygonBar("2026-09-20")] };
      },
    });
    await provider.fetchDailyBars({
      securityId: "s1",
      symbol: "PGN",
      exchange: null,
      dateFrom: "2026-09-19",
      dateTo: "2026-09-20",
    });
    expect(httpCalls).toBe(2);
    expect(budget.used).toBe(2);
  });

  it("charges one unit per retry HTTP attempt (not double per attempt)", async () => {
    const budget = new ProviderRequestBudget(2);
    let httpCalls = 0;
    const provider = createPolygonDailyAdapter({
      verifiedEarliestDailyDate: "2020-01-02",
      fetchAggregates: async () => {
        budget.consumeBeforeRequest();
        httpCalls += 1;
        if (httpCalls === 1) throw new Error("provider daily HTTP 429");
        return { status: "OK", results: [polygonBar("2026-09-19")] };
      },
    });
    const identity = createSecurityIdentityStore();
    const securityId = identity.resolve({
      symbol: "RET",
      exchange: "NASDAQ",
      effectiveDate: "2020-01-02",
      source: "reference-feed",
      provenance: "PROVIDER",
      recordedAt: "2026-10-21T16:00:00.000Z",
    }).securityId!;
    const intelligence = createSecurityIntelligenceStore();
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider,
      config: { dateChunkDays: 1, maxChunksPerRun: 1, retryCount: 1, retryBackoffMs: 0 },
      sleep: async () => undefined,
    });
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: "2026-09-19",
      dateFrom: "2026-09-19",
      dateTo: "2026-09-19",
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    if (!started.ok) throw new Error("start failed");
    await engine.runBatch(started.record.jobId, "2026-10-21T16:01:00.000Z");
    expect(httpCalls).toBe(2);
    expect(budget.used).toBe(2);
  });

  it("does not double-charge engine retry wrapper plus HTTP boundary", async () => {
    const budget = new ProviderRequestBudget(2);
    let httpCalls = 0;
    const identity = createSecurityIdentityStore();
    const securityId = identity.resolve({
      symbol: "ACC",
      exchange: "NASDAQ",
      effectiveDate: "2020-01-02",
      source: "reference-feed",
      provenance: "PROVIDER",
      recordedAt: "2026-10-21T16:00:00.000Z",
    }).securityId!;
    const intelligence = createSecurityIntelligenceStore();
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: budgetedFetch(budget, async () => {
        httpCalls += 1;
        return {
          coverage: "SUPPORTED",
          bars: [{ sessionDate: "2026-09-19", open: 1, high: 1, low: 1, close: 1, volume: 1 }],
          source: "fixture",
          sourceAsOf: null,
          fetchedAt: "2026-10-21T16:00:00.000Z",
          error: null,
          complete: true,
        };
      }),
      config: { dateChunkDays: 1, maxChunksPerRun: 2, retryCount: 0 },
    });
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: "2026-09-20",
      dateFrom: "2026-09-19",
      dateTo: "2026-09-20",
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    if (!started.ok) throw new Error("start failed");
    await engine.runBatch(started.record.jobId, "2026-10-21T16:01:00.000Z");
    expect(httpCalls).toBe(2);
    expect(budget.used).toBe(2);
  });
});
