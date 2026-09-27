import type { ShadowHeartbeat } from "@/lib/ai-trader/runtime/contracts";

export function emptyShadowHeartbeat(workerId: string): ShadowHeartbeat {
  return {
    workerId,
    lastCycleStart: null,
    lastCycleCompletion: null,
    lastSuccess: null,
    lastError: null,
    mode: null,
    session: null,
  };
}
