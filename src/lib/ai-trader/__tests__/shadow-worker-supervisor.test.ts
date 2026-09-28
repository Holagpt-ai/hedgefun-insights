import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { MarketCandidate } from "@/lib/ai-trader/market/candidate";
import { MARKET_INTELLIGENCE_CAPABILITIES } from "@/lib/ai-trader/market/candidate";
import { createMemoryShadowPersistence } from "@/lib/ai-trader/runtime/memory-shadow-persistence";
import { readShadowWorkerConfig, serviceRoleCredentialAccepted } from "@/lib/ai-trader/runtime/env-contract";
import { runShadowWorkerBootstrap } from "@/lib/ai-trader/runtime/shadow-worker-bootstrap";
import { runShadowWorkerProcess } from "@/lib/ai-trader/runtime/shadow-worker-process";
import {
  classifyShadowWorkerReadiness,
  createShadowWorkerSupervisor,
  type ShadowWorkerProbe,
} from "@/lib/ai-trader/runtime/shadow-worker-supervisor";
import type { ShadowCycleResult } from "@/lib/ai-trader/runtime/contracts";
import type { ShadowReadinessInput } from "@/lib/ai-trader/runtime/readiness";

const PROJECT_REF = "zcjptaolpumhtlwhlemq";

function jwt(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ role })).toString("base64url");
  return `${header}.${payload}.sig`;
}

function serverEnv(overrides: NodeJS.Dict<string> = {}): NodeJS.Dict<string> {
  return {
    SUPABASE_URL: `https://${PROJECT_REF}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: jwt("service_role"),
    HISTORICAL_PRODUCTION_DATABASE_URL: `postgres://user:pass@db.${PROJECT_REF}.supabase.co:5432/postgres`,
    ...overrides,
  };
}

function skippedOff(): ShadowCycleResult {
  return {
    status: "SKIPPED",
    reason: "OPERATING_MODE_OFF",
    cycleId: "cycle-test",
    observedCandidateCount: 0,
    eligibleCandidateCount: 0,
    discoveredCount: 0,
    transitionedCount: 0,
    removedCount: 0,
    contextSnapshotsWritten: 0,
    observationsWritten: 0,
    errors: [],
  };
}

function offProbe(): ShadowWorkerProbe {
  return {
    state: "OPERATING_MODE_OFF",
    infrastructureReady: true,
    mode: "OFF",
    databaseReachable: true,
    reasons: ["BROKER_NOT_REQUIRED", "MODEL_NOT_REQUIRED"],
  };
}

function candidate(): MarketCandidate {
  return {
    symbol: "AMC",
    securityId: null,
    assetClass: "US_EQUITY",
    source: "radar_v22_board",
    sourceRank: 1,
    sourceSession: "2026-09-28:market",
    surveillanceDate: "2026-09-28",
    lifecycle: "ACTIVE",
    lastPrice: 2.4,
    volume: 1_500_000,
    shortWindowVolume: 40_000,
    dollarVolume: 90_000,
    sessionHigh: 2.6,
    sessionLow: 2.2,
    sessionVwap: null,
    rvol5m: null,
    scannerEvents: null,
    catalystRefs: [],
    historicalRefs: [],
    quality: {
      feedStatus: "available",
      missingFields: [],
      capabilities: MARKET_INTELLIGENCE_CAPABILITIES,
    },
    provenance: {
      generationId: "gen-1",
      providerAsOf: "2026-09-28T13:34:00.000Z",
      radarUpdatedAt: "2026-09-28T13:34:00.000Z",
      table: "radar_v22_board",
    },
  };
}

describe("AI Trader shadow worker orchestration", () => {
  it("skips OFF cycles and does not execute autonomous writers", async () => {
    const persistence = createMemoryShadowPersistence();
    const persistWatchlistChange = vi.spyOn(persistence, "persistWatchlistChange");
    const recordObservation = vi.spyOn(persistence, "recordObservation");
    const upsertContextSnapshot = vi.spyOn(persistence, "upsertContextSnapshot");
    const getCandidateBoard = vi.fn(async () => [candidate()]);
    const readiness: ShadowReadinessInput = {
      runtimeSchemaPresent: true,
      watchlistSchemaPresent: true,
      marketAdapter: { getCandidateBoard, async getSymbolContext() { return null; } },
      sessionPolicyAvailable: true,
      persistence,
      operatingModeReadable: true,
      transitionRpcPresent: true,
    };
    const supervisor = createShadowWorkerSupervisor({
      probe: async () => offProbe(),
      runCycle: () => runShadowWorkerBootstrap(
        {
          readOperatingMode: async () => "OFF",
          marketAdapter: readiness.marketAdapter!,
          persistence,
          now: () => new Date("2026-09-28T13:35:00.000Z"),
          resolveSession: () => "REGULAR",
        },
        readiness,
        { allowExecute: true },
      ),
    }, { workerId: "test-worker", intervalMs: 60_000, gitSha: "abc" });

    const result = await supervisor.tick();
    expect(result?.status).toBe("SKIPPED");
    expect(result?.reason).toBe("OPERATING_MODE_OFF");
    expect(supervisor.healthSnapshot()).toMatchObject({
      status: "healthy",
      readiness: "OPERATING_MODE_OFF",
      operatingMode: "OFF",
      lastCycleDisposition: "SKIPPED/OPERATING_MODE_OFF",
      completedCycleCount: 1,
    });
    expect(persistWatchlistChange).not.toHaveBeenCalled();
    expect(recordObservation).not.toHaveBeenCalled();
    expect(upsertContextSnapshot).not.toHaveBeenCalled();
    expect(getCandidateBoard).not.toHaveBeenCalled();
    expect(persistence.counts.watchlistWrites).toBe(0);
    expect(persistence.counts.transitionWrites).toBe(0);
    expect(persistence.counts.sessionWrites).toBe(0);
    expect(persistence.items).toHaveLength(0);
  });

  it("fails closed when server environment is missing", async () => {
    const connect = vi.fn();
    const code = await runShadowWorkerProcess({}, { connect });
    expect(code).toBe(1);
    expect(connect).not.toHaveBeenCalled();
    expect(readShadowWorkerConfig({})).toMatchObject({ error: "CONFIGURATION_ERROR" });
    expect(serviceRoleCredentialAccepted(jwt("anon"))).toBe(false);
    expect(serviceRoleCredentialAccepted(jwt("service_role"))).toBe(true);
    expect("error" in readShadowWorkerConfig(serverEnv())).toBe(false);
  });

  it("fails closed when runtime state cannot be read", async () => {
    const runCycle = vi.fn();
    const supervisor = createShadowWorkerSupervisor({
      probe: async () => ({
        state: "RUNTIME_STATE_UNAVAILABLE",
        infrastructureReady: false,
        mode: null,
        databaseReachable: true,
        reasons: ["OPERATING_MODE_UNREADABLE"],
      }),
      runCycle,
    }, { workerId: "test-worker", intervalMs: 60_000 });
    const result = await supervisor.tick();
    expect(result?.status).toBe("FAILED");
    expect(result?.reason).toBe("RUNTIME_STATE_UNAVAILABLE");
    expect(runCycle).not.toHaveBeenCalled();
    expect(supervisor.healthSnapshot().status).toBe("not_ready");
  });

  it("fails closed when the transition RPC is unavailable", async () => {
    const runCycle = vi.fn();
    const supervisor = createShadowWorkerSupervisor({
      probe: async () => ({
        state: "RPC_NOT_APPLIED",
        infrastructureReady: false,
        mode: "OFF",
        databaseReachable: true,
        reasons: ["TRANSITION_RPC_MISSING"],
      }),
      runCycle,
    }, { workerId: "test-worker", intervalMs: 60_000 });
    const result = await supervisor.tick();
    expect(result?.reason).toBe("RPC_NOT_APPLIED");
    expect(runCycle).not.toHaveBeenCalled();
    expect(classifyShadowWorkerReadiness(
      { status: "NOT_READY", reasons: ["TRANSITION_RPC_MISSING", "BROKER_NOT_REQUIRED"] },
      "OFF",
      true,
    )).toBe("RPC_NOT_APPLIED");
  });

  it("does not run a second cycle while one cycle is active", async () => {
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let markStarted: () => void = () => {};
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const supervisor = createShadowWorkerSupervisor({
      probe: async () => offProbe(),
      runCycle: async () => {
        calls += 1;
        markStarted();
        await gate;
        return skippedOff();
      },
    }, { workerId: "test-worker", intervalMs: 60_000 });

    const first = supervisor.tick();
    await started;
    const second = await supervisor.tick();
    expect(second).toBeNull();
    expect(calls).toBe(1);
    release();
    const completed = await first;
    expect(completed?.reason).toBe("OPERATING_MODE_OFF");
    expect(calls).toBe(1);
  });

  it("keeps safety gates closed after a cycle failure", async () => {
    const writers = vi.fn();
    let failed = false;
    const supervisor = createShadowWorkerSupervisor({
      probe: async () => failed
        ? {
            state: "RPC_NOT_APPLIED",
            infrastructureReady: false,
            mode: "OFF",
            databaseReachable: true,
            reasons: ["TRANSITION_RPC_MISSING"],
          }
        : offProbe(),
      runCycle: async () => {
        failed = true;
        throw new Error("cycle failed");
      },
    }, { workerId: "test-worker", intervalMs: 60_000 });

    const first = await supervisor.tick();
    expect(first?.reason).toBe("CYCLE_FAILED");
    const second = await supervisor.tick();
    expect(second?.reason).toBe("RPC_NOT_APPLIED");
    expect(writers).not.toHaveBeenCalled();
    expect(supervisor.healthSnapshot().completedCycleCount).toBe(0);
  });

  it("stops the loop on abort without starting another cycle", async () => {
    const ac = new AbortController();
    let cycles = 0;
    const supervisor = createShadowWorkerSupervisor({
      probe: async () => offProbe(),
      runCycle: async () => {
        cycles += 1;
        ac.abort();
        return skippedOff();
      },
    }, {
      workerId: "test-worker",
      intervalMs: 60_000,
      sleep: () => Promise.reject(new Error("sleep should not run after abort")),
    });
    await supervisor.run(ac.signal);
    expect(cycles).toBe(1);
  });

  it("keeps the worker package free of broker and model credentials", () => {
    const workerMain = readFileSync(join(process.cwd(), "services/ai-trader-shadow-worker/src/main.ts"), "utf8");
    const production = readFileSync(join(process.cwd(), "src/lib/ai-trader/runtime/shadow-worker-production.ts"), "utf8");
    expect(workerMain).not.toMatch(/anthropic|openai|gemini|alpaca|broker/i);
    expect(production).not.toMatch(/anthropic|openai|gemini|alpaca/i);
    expect(production).not.toMatch(/UPDATE\s+public\.ai_trader_runtime/i);
    expect(production).not.toContain("VITE_");
  });
});
