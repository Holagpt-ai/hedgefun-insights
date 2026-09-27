import { evaluateShadowReadiness, type ShadowReadinessInput } from "@/lib/ai-trader/runtime/readiness";
import { createAiTraderShadowRuntime, type ShadowRuntimeDeps } from "@/lib/ai-trader/runtime/shadow-runtime";
import type { ShadowCycleResult } from "@/lib/ai-trader/runtime/contracts";
import { SHADOW_WORKER_ENV_KEYS, shadowWorkerUsesBrowserEnv } from "@/lib/ai-trader/runtime/env-contract";

export interface ShadowWorkerEnv {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
}

export function readShadowWorkerEnv(env: NodeJS.Dict<string> = process.env): ShadowWorkerEnv | { error: string } {
  const supabaseUrl = env[SHADOW_WORKER_ENV_KEYS.supabaseUrl];
  const supabaseServiceRoleKey = env[SHADOW_WORKER_ENV_KEYS.supabaseServiceRoleKey];
  if (shadowWorkerUsesBrowserEnv(SHADOW_WORKER_ENV_KEYS.supabaseUrl)) {
    return { error: "VITE_ env is forbidden for the shadow worker" };
  }
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return { error: "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required" };
  }
  return { supabaseUrl, supabaseServiceRoleKey };
}

export function shadowWorkerExecuteAllowed(env: NodeJS.Dict<string> = process.env): boolean {
  return env.AI_TRADER_SHADOW_WORKER_ALLOW_EXECUTE === "1";
}

/**
 * Trusted-server bootstrap. Importing this module does not start a cycle
 * and does not change operating mode.
 */
export async function runShadowWorkerBootstrap(
  deps: ShadowRuntimeDeps,
  readiness: ShadowReadinessInput,
  options: { allowExecute: true },
): Promise<ShadowCycleResult> {
  if (!options.allowExecute) {
    throw new Error("Shadow worker bootstrap requires explicit allowExecute");
  }
  const ready = evaluateShadowReadiness(readiness);
  if (ready.status === "NOT_READY") {
    return {
      status: "FAILED",
      reason: ready.reasons.find((reason) => !reason.endsWith("_NOT_REQUIRED")) ?? "NOT_READY",
      cycleId: "bootstrap",
      observedCandidateCount: 0,
      eligibleCandidateCount: 0,
      discoveredCount: 0,
      transitionedCount: 0,
      removedCount: 0,
      contextSnapshotsWritten: 0,
      observationsWritten: 0,
      errors: ready.reasons.map((code) => ({ scope: "SYSTEMIC" as const, code, message: code })),
    };
  }
  const runtime = createAiTraderShadowRuntime(deps);
  return runtime.runCycle();
}
