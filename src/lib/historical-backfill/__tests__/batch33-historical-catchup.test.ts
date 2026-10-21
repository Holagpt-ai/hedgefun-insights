import { describe, expect, it } from "vitest";
import { HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE } from "@/config/historical-backfill.config";
import { readHistoricalCatchupLimitsFromEnv } from "@/config/historical-catchup.config";
import {
  filterSymbolsNeedingCatchUp,
  legacyMinSessionBackfilled,
  symbolCoverageCurrentThroughTarget,
} from "@/lib/historical-backfill/catch-up-eligibility";
import { HistoricalBackfillEngine } from "@/lib/historical-backfill/engine";
import {
  readIntradayCatchupLimitsFromEnv,
  INTRADAY_CATCHUP_DEFAULTS,
} from "@/lib/historical-backfill/intraday-catchup";
import { resolveHistoricalCatchUpTargetSession } from "@/lib/historical-backfill/production-rollout";
import {
  resolveProviderStartDate,
  validateHistoricalCatchUpTargetSession,
} from "@/lib/historical-backfill/production-target-date";
import { createSecurityIdentityStore } from "@/lib/security-identity/security-identity";
import { createSecurityIntelligenceStore } from "@/lib/security-intelligence/security-intelligence";
import type { DailyBarsRequest, DailyBarsResult, ProviderDailyBar } from "@/types/historical-backfill";
import type { SecurityIdentityObservation } from "@/types/security-identity";

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

describe("Batch 33 historical catch-up controls", () => {
  it("rejects missing, malformed, weekend, future, and incomplete target sessions", () => {
    expect(validateHistoricalCatchUpTargetSession({ raw: "", now: AFTER_CLOSE }).ok).toBe(false);
    expect(validateHistoricalCatchUpTargetSession({ raw: "2026-13-01", now: AFTER_CLOSE }).ok).toBe(false);
    expect(validateHistoricalCatchUpTargetSession({ raw: "2026-10-18", now: AFTER_CLOSE }).ok).toBe(false);
    expect(validateHistoricalCatchUpTargetSession({ raw: "2026-12-31", now: AFTER_CLOSE }).ok).toBe(false);

    const todayEtIncomplete = validateHistoricalCatchUpTargetSession({
      raw: "2026-10-21",
      now: new Date("2026-10-21T15:00:00.000Z"),
    });
    expect(todayEtIncomplete.ok).toBe(false);
    if (todayEtIncomplete.ok === false) expect(todayEtIncomplete.reason).toBe("incomplete_session");

    const ok = validateHistoricalCatchUpTargetSession({ raw: "2026-10-20", now: AFTER_CLOSE });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.targetSession).toBe("2026-10-20");
  });

  it("fails closed when catch-up target env is absent", () => {
    const resolved = resolveHistoricalCatchUpTargetSession({ envValue: null, now: AFTER_CLOSE });
    expect(resolved.ok).toBe(false);
  });

  it("does not treat min-session history as current through a newer target", () => {
    const row = { symbol: "AAA", latestSession: "2026-09-18", sessionCount: 1200 };
    expect(legacyMinSessionBackfilled(row, 1200)).toBe(true);
    expect(symbolCoverageCurrentThroughTarget(row, "2026-10-20")).toBe(false);
    expect(filterSymbolsNeedingCatchUp([row], "2026-10-20")).toEqual(["AAA"]);
  });

  it("skips symbols already current through the target", () => {
    const current = { symbol: "BBB", latestSession: "2026-10-20", sessionCount: 1210 };
    expect(symbolCoverageCurrentThroughTarget(current, "2026-10-20")).toBe(true);
    expect(filterSymbolsNeedingCatchUp([current], "2026-10-20")).toEqual([]);
  });

  it("starts provider fetches after the latest stored session", () => {
    expect(
      resolveProviderStartDate({
        globalDateFrom: HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE,
        latestStoredSession: "2026-09-18",
      }),
    ).toBe("2026-09-19");
  });

  it("uses per-security providerStarts so catch-up does not re-request full span", async () => {
    const identity = createSecurityIdentityStore();
    const intelligence = createSecurityIntelligenceStore();
    const observation: SecurityIdentityObservation = {
      symbol: "CATCH",
      exchange: "NASDAQ",
      effectiveDate: "2020-01-02",
      source: "reference-feed",
      provenance: "PROVIDER",
      recordedAt: "2026-10-21T16:00:00.000Z",
    };
    const resolved = identity.resolve(observation);
    const securityId = resolved.securityId!;

    const requestedFrom: string[] = [];
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: {
        fetchDailyBars: async (request: DailyBarsRequest) => {
          requestedFrom.push(request.dateFrom);
          return supported([bar(request.dateFrom)]);
        },
      },
      config: { dateChunkDays: 5, maxChunksPerRun: 1, retryCount: 0 },
    });

    const providerStarts = { [securityId]: "2026-09-19" };
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: "2026-10-20",
      dateFrom: HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE,
      dateTo: "2026-10-20",
      recordedAt: "2026-10-21T16:00:00.000Z",
      providerStarts,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    await engine.runBatch(started.record.jobId, "2026-10-21T16:05:00.000Z");
    expect(requestedFrom[0]).toBe("2026-09-19");
  });

  it("resumes a paused job without requiring a new start", async () => {
    const { identity, securityId } = (() => {
      const identity = createSecurityIdentityStore();
      const created = identity.resolve({
        symbol: "RESM",
        exchange: "NASDAQ",
        effectiveDate: "2020-01-02",
        source: "reference-feed",
        provenance: "PROVIDER",
        recordedAt: "2026-10-21T16:00:00.000Z",
      });
      return { identity, securityId: created.securityId! };
    })();
    const intelligence = createSecurityIntelligenceStore();
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: {
        fetchDailyBars: async () => ({
          coverage: "UNAVAILABLE",
          bars: [],
          source: "fixture",
          sourceAsOf: null,
          fetchedAt: "2026-10-21T16:00:00.000Z",
          error: "unavailable",
          complete: false,
        }),
      },
      config: { dateChunkDays: 1, maxChunksPerRun: 1, retryCount: 0 },
    });
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: "2026-10-20",
      dateFrom: "2026-10-20",
      dateTo: "2026-10-20",
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const paused = await engine.runBatch(started.record.jobId, "2026-10-21T16:01:00.000Z");
    expect(paused.state).toBe("PAUSED");
    const resumed = await engine.resume(started.record.jobId, "2026-10-21T16:02:00.000Z");
    expect(resumed.ok).toBe(true);
    const job = await intelligence.getJob(started.record.jobId);
    expect(job?.state).toBe("RUNNING");
  });

  it("does not allow resume on a completed job", async () => {
    const identity = createSecurityIdentityStore();
    const intelligence = createSecurityIntelligenceStore();
    const created = identity.resolve({
      symbol: "DONE",
      exchange: "NASDAQ",
      effectiveDate: "2020-01-02",
      source: "reference-feed",
      provenance: "PROVIDER",
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: { fetchDailyBars: async (request) => supported([bar(request.dateFrom)]) },
      config: { dateChunkDays: 1, maxChunksPerRun: 2, retryCount: 0 },
    });
    const started = await engine.start({
      securities: [{ securityId: created.securityId! }],
      completedSessionDate: "2026-10-20",
      dateFrom: "2026-10-20",
      dateTo: "2026-10-20",
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    if (!started.ok) throw new Error("start failed");
    let stats = await engine.runBatch(started.record.jobId, "2026-10-21T16:01:00.000Z");
    while (stats.state === "RUNNING") {
      stats = await engine.runBatch(started.record.jobId, "2026-10-21T16:02:00.000Z");
    }
    expect(stats.state).toBe("COMPLETE");
    const resumeAttempt = await engine.resume(started.record.jobId, "2026-10-21T16:03:00.000Z");
    expect(resumeAttempt.ok).toBe(false);
  });

  it("bounds intraday reconstruction defaults", () => {
    const emptyEnv = { get: () => undefined };
    const limits = readIntradayCatchupLimitsFromEnv(emptyEnv);
    expect(limits.maxEpisodesPerRun).toBe(INTRADAY_CATCHUP_DEFAULTS.maxEpisodesPerRun);
    expect(limits.includeExisting).toBe(false);
    const flyLimits = readHistoricalCatchupLimitsFromEnv(emptyEnv);
    expect(flyLimits.maxNoProgressBatches).toBeGreaterThan(0);
  });
});
