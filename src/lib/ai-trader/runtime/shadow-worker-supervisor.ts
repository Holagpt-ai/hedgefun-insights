import type { AiTraderOperatingMode } from "@/lib/ai-trader/operating-mode";
import type { ShadowCycleResult, ShadowReadinessResult } from "@/lib/ai-trader/runtime/contracts";
import type { ShadowRuntimeLogger } from "@/lib/ai-trader/runtime/logger";
import { createSilentShadowLogger } from "@/lib/ai-trader/runtime/logger";

export const SHADOW_WORKER_READINESS_STATES = [
  "READY",
  "OPERATING_MODE_OFF",
  "RPC_NOT_APPLIED",
  "CONFIGURATION_ERROR",
  "DATABASE_UNAVAILABLE",
  "RUNTIME_STATE_UNAVAILABLE",
  "SESSION_POLICY_UNAVAILABLE",
  "NOT_READY",
] as const;

export type ShadowWorkerReadinessState = (typeof SHADOW_WORKER_READINESS_STATES)[number];

export interface ShadowWorkerProbe {
  state: ShadowWorkerReadinessState;
  infrastructureReady: boolean;
  mode: AiTraderOperatingMode | null;
  databaseReachable: boolean;
  reasons: readonly string[];
}

export interface ShadowWorkerHost {
  probe(): Promise<ShadowWorkerProbe>;
  runCycle(): Promise<ShadowCycleResult>;
}

export interface ShadowWorkerHealthSnapshot {
  status: "healthy" | "not_ready";
  database: "reachable" | "unavailable" | "unknown";
  operatingMode: string | null;
  readiness: ShadowWorkerReadinessState;
  lastCycleDisposition: string | null;
  lastCycleCompletedAt: string | null;
  completedCycleCount: number;
  gitSha: string | null;
  workerId: string;
}

export function classifyShadowWorkerReadiness(
  evaluated: ShadowReadinessResult,
  mode: AiTraderOperatingMode | null,
  databaseReachable: boolean,
): ShadowWorkerReadinessState {
  if (!databaseReachable) return "DATABASE_UNAVAILABLE";
  if (evaluated.status === "NOT_READY") {
    if (evaluated.reasons.includes("RUNTIME_SCHEMA_MISSING") || evaluated.reasons.includes("OPERATING_MODE_UNREADABLE")) {
      return "RUNTIME_STATE_UNAVAILABLE";
    }
    if (evaluated.reasons.includes("TRANSITION_RPC_MISSING")) return "RPC_NOT_APPLIED";
    if (evaluated.reasons.includes("SESSION_POLICY_MISSING")) return "SESSION_POLICY_UNAVAILABLE";
    return "NOT_READY";
  }
  if (mode === "OFF") return "OPERATING_MODE_OFF";
  return "READY";
}

export function interruptibleSleep(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function emptyCycle(reason: string): ShadowCycleResult {
  return {
    status: "FAILED",
    reason,
    cycleId: "not-ready",
    observedCandidateCount: 0,
    eligibleCandidateCount: 0,
    discoveredCount: 0,
    transitionedCount: 0,
    removedCount: 0,
    contextSnapshotsWritten: 0,
    observationsWritten: 0,
    errors: [{ scope: "SYSTEMIC", code: reason, message: reason }],
  };
}

export function cycleDisposition(result: ShadowCycleResult): string {
  return result.reason ? `${result.status}/${result.reason}` : result.status;
}

export function createShadowWorkerSupervisor(
  host: ShadowWorkerHost,
  options: {
    workerId: string;
    gitSha?: string | null;
    intervalMs: number;
    logger?: ShadowRuntimeLogger;
    sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
    now?: () => Date;
  },
) {
  const logger = options.logger ?? createSilentShadowLogger();
  const sleep = options.sleep ?? interruptibleSleep;
  const now = options.now ?? (() => new Date());
  let inFlight = false;
  let readiness: ShadowWorkerReadinessState = "NOT_READY";
  let mode: string | null = null;
  let database: ShadowWorkerHealthSnapshot["database"] = "unknown";
  let lastCycleDisposition: string | null = null;
  let lastCycleCompletedAt: string | null = null;
  let completedCycleCount = 0;
  let lastError: string | null = null;

  function healthSnapshot(): ShadowWorkerHealthSnapshot {
    const healthy = readiness === "READY" || readiness === "OPERATING_MODE_OFF";
    return {
      status: healthy ? "healthy" : "not_ready",
      database,
      operatingMode: mode,
      readiness,
      lastCycleDisposition,
      lastCycleCompletedAt,
      completedCycleCount,
      gitSha: options.gitSha ?? null,
      workerId: options.workerId,
    };
  }

  async function tick(): Promise<ShadowCycleResult | null> {
    if (inFlight) {
      logger.info("shadow_cycle_overlap_skipped", { workerId: options.workerId });
      return null;
    }
    inFlight = true;
    try {
      const probe = await host.probe();
      readiness = probe.state;
      mode = probe.mode;
      database = probe.databaseReachable ? "reachable" : "unavailable";
      if (!probe.infrastructureReady) {
        lastError = probe.state;
        logger.error("shadow_worker_not_ready", {
          workerId: options.workerId,
          readiness: probe.state,
          reasons: probe.reasons.filter((reason) => !reason.endsWith("_NOT_REQUIRED")),
        });
        return emptyCycle(probe.state);
      }
      logger.info("shadow_cycle_start", {
        workerId: options.workerId,
        readiness: probe.state,
        operatingMode: probe.mode,
      });
      const result = await host.runCycle();
      const disposition = cycleDisposition(result);
      lastCycleDisposition = disposition;
      lastCycleCompletedAt = now().toISOString();
      completedCycleCount += 1;
      if (result.status === "FAILED") {
        lastError = result.reason ?? "FAILED";
        logger.error("shadow_cycle_failed", {
          workerId: options.workerId,
          disposition,
          cycleId: result.cycleId,
        });
      } else {
        lastError = null;
        logger.info("shadow_cycle_complete", {
          workerId: options.workerId,
          disposition,
          status: result.status,
          reason: result.reason ?? null,
          cycleId: result.cycleId,
          discoveredCount: result.discoveredCount,
          transitionedCount: result.transitionedCount,
          observationsWritten: result.observationsWritten,
          contextSnapshotsWritten: result.contextSnapshotsWritten,
        });
      }
      return result;
    } catch (error) {
      lastError = "CYCLE_FAILED";
      readiness = readiness === "OPERATING_MODE_OFF" || readiness === "READY" ? readiness : "NOT_READY";
      logger.error("shadow_cycle_failed", {
        workerId: options.workerId,
        disposition: "FAILED/CYCLE_FAILED",
        message: error instanceof Error ? error.name : "Error",
      });
      return emptyCycle("CYCLE_FAILED");
    } finally {
      inFlight = false;
    }
  }

  async function run(signal: AbortSignal): Promise<void> {
    logger.info("shadow_worker_start", {
      workerId: options.workerId,
      gitSha: options.gitSha ?? null,
      pollIntervalMs: options.intervalMs,
    });
    while (!signal.aborted) {
      await tick();
      if (signal.aborted) break;
      await sleep(options.intervalMs, signal);
    }
    logger.info("shadow_worker_shutdown", {
      workerId: options.workerId,
      completedCycleCount,
      readiness,
      operatingMode: mode,
    });
  }

  return { tick, run, healthSnapshot, get inFlight() { return inFlight; } };
}
