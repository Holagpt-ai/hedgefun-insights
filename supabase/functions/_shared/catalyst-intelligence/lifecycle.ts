// Deterministic Intelligence-layer lifecycle. Does not mutate catalyst_events.
// Only states that can be derived from existing fields today.

import type { ClassificationResult } from "./classify.ts";
import type { IntelligenceLifecycle, NormalizedCatalystInput } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

function hasEarningsOutcomeFacts(facts: Record<string, unknown> | undefined): boolean {
  if (!facts) return false;
  if (typeof facts.actual_eps === "number" && Number.isFinite(facts.actual_eps)) return true;
  if (typeof facts.surprise_percent === "number" && Number.isFinite(facts.surprise_percent)) {
    return true;
  }
  const outcome = facts.earnings_outcome;
  return outcome === "beat" || outcome === "miss";
}

export function deriveLifecycle(
  input: NormalizedCatalystInput,
  classified: ClassificationResult,
  nowMs: number,
): IntelligenceLifecycle {
  if (input.provider === "earnings_calendar" && input.event_type === "earnings") {
    return hasEarningsOutcomeFacts(input.facts) ? "outcome" : "scheduled";
  }

  if (classified.classification === "emerging") return "developing";
  if (classified.classification === "hard") return "confirmed";

  const iso = input.published_at ?? input.event_time ?? input.created_at ?? null;
  if (typeof iso === "string") {
    const t = Date.parse(iso);
    if (Number.isFinite(t) && Number.isFinite(nowMs) && nowMs - t > 7 * DAY_MS) {
      return "stale";
    }
  }
  return "developing";
}
