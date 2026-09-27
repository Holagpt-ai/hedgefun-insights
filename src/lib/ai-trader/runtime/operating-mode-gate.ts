import type { AiTraderOperatingMode } from "@/lib/ai-trader/operating-mode";

export const SHADOW_OBSERVATION_MODES: readonly AiTraderOperatingMode[] = ["SHADOW"];

export function observationRuntimePermitted(mode: AiTraderOperatingMode): boolean {
  return SHADOW_OBSERVATION_MODES.includes(mode);
}

export function offCycleSkipResult(mode: AiTraderOperatingMode): "OPERATING_MODE_OFF" | null {
  return mode === "OFF" ? "OPERATING_MODE_OFF" : null;
}
