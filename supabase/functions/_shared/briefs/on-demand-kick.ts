import { fetchGenerateDailyBrief, type FetchLike } from "./invoke-generator.ts";
import { isAmEvaluationWindow } from "./am-window.ts";
import {
  parseGenerationState,
  resolveBriefRead,
  type BriefGenerationState,
  type BriefKind,
} from "./generation-state.ts";

/** Per-instance cooldown so concurrent Pro readers do not stampede the generator. */
export const BRIEF_KICK_COOLDOWN_MS = 120_000;

const recentKickAt = new Map<string, number>();

export function briefKickKey(briefType: BriefKind, briefDate: string): string {
  return `${briefType}:${briefDate}`;
}

export function shouldKickBriefGeneration(input: {
  briefType: BriefKind;
  briefDate: string;
  nowMinutesEt: number;
  hasValidBrief: boolean;
  state: BriefGenerationState | null;
  nowMs?: number;
}): { allow: boolean; reason: string } {
  if (input.hasValidBrief) return { allow: false, reason: "has_brief" };
  const read = resolveBriefRead({ hasValidBrief: false, state: input.state });
  if (read.generation_status === "insufficient_evidence") {
    return { allow: false, reason: "insufficient_evidence" };
  }
  if (input.briefType === "am" && !isAmEvaluationWindow(input.nowMinutesEt)) {
    return { allow: false, reason: "outside_am_window" };
  }
  const nowMs = input.nowMs ?? Date.now();
  const key = briefKickKey(input.briefType, input.briefDate);
  const last = recentKickAt.get(key) ?? 0;
  if (nowMs - last < BRIEF_KICK_COOLDOWN_MS) {
    return { allow: false, reason: "cooldown" };
  }
  return { allow: true, reason: "eligible" };
}

export function markBriefKickAttempt(briefType: BriefKind, briefDate: string, nowMs = Date.now()): void {
  recentKickAt.set(briefKickKey(briefType, briefDate), nowMs);
}

/** Reset process-local cooldown (tests only). */
export function resetBriefKickCooldownForTests(): void {
  recentKickAt.clear();
}

export async function maybeKickBriefGeneration(input: {
  supabaseUrl: string;
  syncSecret: string;
  publishableKey: string;
  briefType: BriefKind;
  briefDate: string;
  nowMinutesEt: number;
  hasValidBrief: boolean;
  stateRow: unknown;
  fetchImpl?: FetchLike;
}): Promise<{ kicked: boolean; reason: string }> {
  const state = parseGenerationState(input.stateRow);
  const gate = shouldKickBriefGeneration({
    briefType: input.briefType,
    briefDate: input.briefDate,
    nowMinutesEt: input.nowMinutesEt,
    hasValidBrief: input.hasValidBrief,
    state,
  });
  if (!gate.allow) return { kicked: false, reason: gate.reason };

  if (!input.syncSecret || !input.supabaseUrl || !input.publishableKey) {
    console.error(JSON.stringify({ event: "brief_on_demand_kick_misconfigured" }));
    return { kicked: false, reason: "misconfigured" };
  }

  markBriefKickAttempt(input.briefType, input.briefDate);
  console.log(JSON.stringify({
    event: "brief_on_demand_kick",
    brief_type: input.briefType,
    brief_date: input.briefDate,
  }));

  const body: Record<string, unknown> = { briefType: input.briefType, trigger_type: "on_demand_read" };
  void fetchGenerateDailyBrief({
    supabaseUrl: input.supabaseUrl,
    syncSecret: input.syncSecret,
    publishableKey: input.publishableKey,
    body,
    fetchImpl: input.fetchImpl,
  }).catch((err) => {
    console.error(JSON.stringify({
      event: "brief_on_demand_kick_invoke_failed",
      brief_type: input.briefType,
      message: err instanceof Error ? err.name : "unknown",
    }));
  });

  return { kicked: true, reason: "invoked" };
}
