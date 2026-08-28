import {
  AM_V2_SOURCE,
  AM_V2_VERSION,
  isMaterialChange,
  readMaterialState,
  type AmMaterialState,
} from "./am-evidence.ts";

export type AmGenerationDecision =
  | { action: "fail_closed"; reason: string }
  | { action: "return_cached" }
  | { action: "generate"; persist: "insert" | "update"; existingId?: string };

export function isAmV2Snapshot(snapshot: unknown): boolean {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  const s = snapshot as Record<string, unknown>;
  return s.version === AM_V2_VERSION && s.source === AM_V2_SOURCE;
}

/**
 * AM V2 generation gate. Page renders never reach this function.
 * Claude is called only on first eligible run or a material evidence change.
 */
export function decideAmGeneration(input: {
  indexesValid: boolean;
  staleOrMissingReason?: string;
  existing: { id: string; market_snapshot: unknown } | null;
  incomingState: AmMaterialState;
}): AmGenerationDecision {
  if (!input.indexesValid) {
    return {
      action: "fail_closed",
      reason: input.staleOrMissingReason ?? "source_stale",
    };
  }
  if (!input.existing) {
    return { action: "generate", persist: "insert" };
  }
  if (!isAmV2Snapshot(input.existing.market_snapshot)) {
    return {
      action: "generate",
      persist: "update",
      existingId: input.existing.id,
    };
  }
  const prev = readMaterialState(input.existing.market_snapshot);
  if (!prev) {
    return {
      action: "generate",
      persist: "update",
      existingId: input.existing.id,
    };
  }
  const change = isMaterialChange(prev, input.incomingState);
  if (change.material) {
    return {
      action: "generate",
      persist: "update",
      existingId: input.existing.id,
    };
  }
  return { action: "return_cached" };
}
