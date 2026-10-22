import { afterEach, describe, expect, it, vi } from "vitest";
import { HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE } from "@/config/historical-backfill.config";
import {
  HISTORICAL_CATCHUP_PREFLIGHT_ENV,
  HISTORICAL_CATCHUP_RESUME_JOB_ID_ENV,
  HISTORICAL_CATCHUP_RESUME_ONLY_ENV,
  HistoricalCatchupResumeOnlyError,
  isHistoricalCatchupResumeOnlyEnabled,
  readHistoricalCatchupResumeOnlyFromEnv,
} from "@/config/historical-catchup.config";
import { HISTORICAL_CATCHUP_LIMITS } from "@/config/historical-catchup.config";
import { HistoricalBackfillEngine } from "@/lib/historical-backfill/engine";
import {
  ProviderRequestBudget,
} from "@/lib/historical-backfill/provider-request-budget";
import {
  resumeInterruptedJobById,
  runHistoricalCatchUpPreflight,
  runHistoricalCatchUpResumeOnly,
} from "@/lib/historical-backfill/production-rollout";
import type { HistoricalPersistence } from "@/lib/persistence/historical-persistence";
import { createSecurityIdentityStore } from "@/lib/security-identity/security-identity";
import { createSecurityIntelligenceStore } from "@/lib/security-intelligence/security-intelligence";
import type { DailyBarsResult, ProviderDailyBar } from "@/types/historical-backfill";

const TARGET = "2026-10-20";
const DATE_FROM = HISTORICAL_VERIFIED_EARLIEST_DAILY_DATE;
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
    effectiveDate: DATE_FROM,
    source: "reference-feed",
    provenance: "PROVIDER",
    recordedAt: "2026-10-21T16:00:00.000Z",
  });
  return { identity, securityId: created.securityId! };
}

function buildPersistence(input: {
  intelligence: ReturnType<typeof createSecurityIntelligenceStore>;
  identity: ReturnType<typeof createSecurityIdentityStore>;
  findInterruptedJob?: HistoricalPersistence["rollout"]["findInterruptedJob"];
  loadEligibleSymbols?: HistoricalPersistence["rollout"]["loadEligibleSymbols"];
}): HistoricalPersistence {
  const loadEligibleSymbols = input.loadEligibleSymbols ?? (async () => {
    throw new Error("loadEligibleSymbols must not be called in resume-only");
  });
  return {
    transport: "postgres",
    identity: input.identity,
    intelligence: input.intelligence,
    rollout: {
      findInterruptedJob: input.findInterruptedJob ?? (async () => null),
      loadBackfilledSymbols: async () => new Set(),
      loadSymbolSessionCoverage: async () => [],
      loadEligibleSymbols,
    },
    close: async () => undefined,
  } as unknown as HistoricalPersistence;
}

function buildEngine(
  identity: ReturnType<typeof createSecurityIdentityStore>,
  intelligence: ReturnType<typeof createSecurityIntelligenceStore>,
  fetchDailyBars?: (request: { dateFrom: string; securityId: string; symbol: string }) => Promise<DailyBarsResult>,
) {
  return new HistoricalBackfillEngine({
    identity,
    intelligence,
    provider: {
      fetchDailyBars: fetchDailyBars ?? (async (request) => supported([bar(request.dateFrom)])),
    },
    config: { dateChunkDays: 5000, maxChunksPerRun: 5, retryCount: 0 },
  });
}

describe("Batch 33.6 resume-only execution guard", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("requires job id when resume-only env is enabled", () => {
    vi.stubEnv(HISTORICAL_CATCHUP_RESUME_ONLY_ENV, "1");
    expect(() => readHistoricalCatchupResumeOnlyFromEnv()).toThrow(HistoricalCatchupResumeOnlyError);
  });

  it("preflight-only takes precedence over resume-only env", () => {
    vi.stubEnv(HISTORICAL_CATCHUP_PREFLIGHT_ENV, "1");
    vi.stubEnv(HISTORICAL_CATCHUP_RESUME_ONLY_ENV, "1");
    expect(isHistoricalCatchupResumeOnlyEnabled()).toBe(true);
    return runHistoricalCatchUpPreflight({
      targetSession: TARGET,
      now: AFTER_CLOSE,
      limits: HISTORICAL_CATCHUP_LIMITS,
    }).then((result) => {
      expect(result.targetSession).toBe(TARGET);
    });
  });

  it("resume_only_noop when job is missing", async () => {
    const { identity } = listed("NOP");
    const intelligence = createSecurityIntelligenceStore();
    const persistence = buildPersistence({ identity, intelligence });
    const result = await runHistoricalCatchUpResumeOnly({
      targetSession: TARGET,
      now: AFTER_CLOSE,
      limits: HISTORICAL_CATCHUP_LIMITS,
      persistenceOverride: persistence,
      resumeJobId: "fe8e5224-828e-484a-b22c-80c330ec547a",
    });
    expect(result.terminalEvent).toBe("resume_only_noop");
    expect(result.stopReason).toBe("job_missing");
    expect(result.eligibilityJobCreated).toBe(false);
  });

  it("resume_only_noop when job is already complete", async () => {
    const { identity, securityId } = listed("CMP");
    const intelligence = createSecurityIntelligenceStore();
    const started = await buildEngine(identity, intelligence).start({
      securities: [{ securityId }],
      completedSessionDate: TARGET,
      dateFrom: DATE_FROM,
      dateTo: TARGET,
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    if (!started.ok) throw new Error(started.reason);
    const engine = buildEngine(identity, intelligence);
    while ((await engine.stats(started.record.jobId, "2026-10-21T16:01:00.000Z")).state === "RUNNING") {
      await engine.runBatch(started.record.jobId, "2026-10-21T16:02:00.000Z");
    }
    const persistence = buildPersistence({ identity, intelligence });
    const result = await runHistoricalCatchUpResumeOnly({
      targetSession: TARGET,
      now: AFTER_CLOSE,
      limits: HISTORICAL_CATCHUP_LIMITS,
      persistenceOverride: persistence,
      resumeJobId: started.record.jobId,
      engineOverride: engine,
    });
    expect(result.terminalEvent).toBe("resume_only_noop");
    expect(result.stopReason).toBe("already_complete");
  });

  it("resume_only_noop on job id and date range mismatch", async () => {
    const { identity, securityId } = listed("DMM");
    const intelligence = createSecurityIntelligenceStore();
    const engine = buildEngine(identity, intelligence);
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: "2026-09-18",
      dateFrom: DATE_FROM,
      dateTo: "2026-09-18",
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    if (!started.ok) throw new Error(started.reason);
    await intelligence.transitionBackfillJob(started.record.jobId, {
      to: "PAUSED",
      recordedAt: "2026-10-21T16:02:00.000Z",
      cursorToken: "0:2021-09-22",
    });
    const persistence = buildPersistence({ identity, intelligence });
    const result = await runHistoricalCatchUpResumeOnly({
      targetSession: TARGET,
      now: AFTER_CLOSE,
      limits: HISTORICAL_CATCHUP_LIMITS,
      persistenceOverride: persistence,
      resumeJobId: started.record.jobId,
      engineOverride: engine,
    });
    expect(result.terminalEvent).toBe("resume_only_noop");
    expect(result.stopReason).toBe("date_range_mismatch");
  });

  it("resume_only_complete exits without eligibility discovery", async () => {
    const { identity, securityId } = listed("RSC");
    const intelligence = createSecurityIntelligenceStore();
    const engine = buildEngine(identity, intelligence);
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: TARGET,
      dateFrom: DATE_FROM,
      dateTo: TARGET,
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    if (!started.ok) throw new Error(started.reason);
    await intelligence.transitionBackfillJob(started.record.jobId, {
      to: "PAUSED",
      recordedAt: "2026-10-21T16:01:00.000Z",
      cursorToken: "0:2021-09-22",
      processedCount: 0,
    });
    const loadEligibleSymbols = vi.fn(async () => ["SHOULD_NOT_RUN"]);
    const persistence = buildPersistence({ identity, intelligence, loadEligibleSymbols });
    const createSpy = vi.spyOn(intelligence, "createBackfillJob");

    const result = await runHistoricalCatchUpResumeOnly({
      targetSession: TARGET,
      now: AFTER_CLOSE,
      limits: HISTORICAL_CATCHUP_LIMITS,
      persistenceOverride: persistence,
      resumeJobId: started.record.jobId,
      engineOverride: engine,
    });

    expect(result.terminalEvent).toBe("resume_only_complete");
    expect(result.finalJobState).toBe("COMPLETE");
    expect(result.eligibilityJobCreated).toBe(false);
    expect(loadEligibleSymbols).not.toHaveBeenCalled();
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("resume_only_paused when job pauses again", async () => {
    const { identity, securityId } = listed("PSE");
    const intelligence = createSecurityIntelligenceStore();
    const engine = new HistoricalBackfillEngine({
      identity,
      intelligence,
      provider: {
        fetchDailyBars: async (): Promise<DailyBarsResult> => ({
          coverage: "UNAVAILABLE",
          bars: [],
          source: "fixture",
          sourceAsOf: null,
          fetchedAt: null,
          error: "incomplete span",
          complete: false,
        }),
      },
      config: { dateChunkDays: 5000, maxChunksPerRun: 1, retryCount: 0 },
    });
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: TARGET,
      dateFrom: DATE_FROM,
      dateTo: TARGET,
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    if (!started.ok) throw new Error(started.reason);
    await intelligence.transitionBackfillJob(started.record.jobId, {
      to: "PAUSED",
      recordedAt: "2026-10-21T16:01:00.000Z",
    });
    const persistence = buildPersistence({ identity, intelligence });
    const result = await runHistoricalCatchUpResumeOnly({
      targetSession: TARGET,
      now: AFTER_CLOSE,
      limits: HISTORICAL_CATCHUP_LIMITS,
      persistenceOverride: persistence,
      resumeJobId: started.record.jobId,
      engineOverride: engine,
    });
    expect(result.terminalEvent).toBe("resume_only_paused");
    expect(result.stopReason).toBe("job_paused");
  });

  it("resume_only_paused when provider request cap is reached", async () => {
    const { identity, securityId } = listed("BUD");
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
        fetchDailyBars: async (request) => {
          budget.consumeBeforeRequest();
          return supported([bar(request.dateFrom)]);
        },
      },
      config: { dateChunkDays: 1, maxChunksPerRun: 5, retryCount: 0 },
    });
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: TARGET,
      dateFrom: DATE_FROM,
      dateTo: TARGET,
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    if (!started.ok) throw new Error(started.reason);
    await engine.runBatch(started.record.jobId, "2026-10-21T16:01:00.000Z");
    const persistence = buildPersistence({ identity, intelligence });
    const limits = { ...HISTORICAL_CATCHUP_LIMITS, maxProviderRequestsPerRun: 1 };
    const result = await resumeInterruptedJobById(
      engine,
      persistence,
      started.record.jobId,
      limits,
      counters,
      budget,
    );
    expect(result.stopReason).toBe("provider_request_limit");
    expect(result.stats.state).toBe("RUNNING");
  });

  it("reports run deltas rather than cumulative checkpoint totals", async () => {
    const { identity, securityId } = listed("DLT");
    const intelligence = createSecurityIntelligenceStore();
    const engine = buildEngine(identity, intelligence);
    const started = await engine.start({
      securities: [{ securityId }],
      completedSessionDate: TARGET,
      dateFrom: DATE_FROM,
      dateTo: TARGET,
      recordedAt: "2026-10-21T16:00:00.000Z",
    });
    if (!started.ok) throw new Error(started.reason);
    await intelligence.transitionBackfillJob(started.record.jobId, {
      to: "PAUSED",
      recordedAt: "2026-10-21T16:02:00.000Z",
      processedCount: 0,
      cursorToken: "0:2021-09-22",
      metadata: started.record.metadata,
    });
    const before = await intelligence.getJob(started.record.jobId);
    const persistence = buildPersistence({ identity, intelligence });
    const result = await runHistoricalCatchUpResumeOnly({
      targetSession: TARGET,
      now: AFTER_CLOSE,
      limits: { ...HISTORICAL_CATCHUP_LIMITS, maxProviderRequestsPerRun: 500 },
      persistenceOverride: persistence,
      resumeJobId: started.record.jobId,
      engineOverride: engine,
    });
    const after = await intelligence.getJob(started.record.jobId);
    expect(result.securitiesProcessedDuringRun).toBe(
      (after?.processedCount ?? 0) - (before?.processedCount ?? 0),
    );
    expect(result.dailyRowsWrittenDuringRun).toBeGreaterThan(0);
    expect(result.startingCursor).toBe("0:2021-09-22");
    expect(result.terminalEvent).toBe("resume_only_complete");
  });

  it("normal catch-up rollout still exposes eligibility batch path after interrupted resume", async () => {
    const source = await import("@/lib/historical-backfill/production-rollout");
    expect(String(source.runHistoricalCatchUpRollout)).toContain("loadEligibleSymbols");
  });

  it("reads resume job id from env when not passed explicitly", () => {
    vi.stubEnv(HISTORICAL_CATCHUP_RESUME_ONLY_ENV, "1");
    vi.stubEnv(HISTORICAL_CATCHUP_RESUME_JOB_ID_ENV, "fe8e5224-828e-484a-b22c-80c330ec547a");
    const config = readHistoricalCatchupResumeOnlyFromEnv();
    expect(config.enabled).toBe(true);
    expect(config.jobId).toBe("fe8e5224-828e-484a-b22c-80c330ec547a");
  });
});
