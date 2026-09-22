import { behaviorProfileConfig } from "@/config/behavior-profile.config";
import type { EpisodeDirection } from "@/config/security-intelligence.config";
import type {
  ComputedForwardOutcomeFacts,
  NextSessionContinuationObservation,
} from "@/lib/forward-outcomes/forward-outcome-types";

/**
 * Canonical next-session continuation observation derived from persisted D1 forward outcome.
 * Matches comparable-historical-episodes continuation threshold semantics.
 */
export function nextSessionContinuationFromD1(input: {
  d1: ComputedForwardOutcomeFacts | null | undefined;
  episodeDirection: EpisodeDirection | null;
  continuationMinMovePct?: number;
}): NextSessionContinuationObservation {
  const config = behaviorProfileConfig(
    input.continuationMinMovePct === undefined
      ? {}
      : { continuationMinMovePct: input.continuationMinMovePct },
  );
  const d1 = input.d1;
  const unavailable: NextSessionContinuationObservation = {
    nextSessionAvailable: false,
    nextSessionReturnPct: null,
    nextSessionHighExcursionPct: null,
    nextSessionLowExcursionPct: null,
    nextSessionClosePosition: null,
    nextSessionVolume: null,
    nextSessionRvol: null,
    nextSessionContinuation: null,
    episodeDirection: input.episodeDirection,
  };

  if (!d1 || !d1.dataAvailable || d1.availabilityState !== "AVAILABLE") return unavailable;

  let continuation: boolean | null = null;
  const move = d1.horizonSessionMovePct;
  if (move !== null && input.episodeDirection === "POSITIVE") {
    continuation = move >= config.continuationMinMovePct;
  } else if (move !== null && input.episodeDirection === "NEGATIVE") {
    continuation = move <= -config.continuationMinMovePct;
  }

  return {
    nextSessionAvailable: true,
    nextSessionReturnPct: d1.horizonSessionMovePct ?? d1.returnPct,
    nextSessionHighExcursionPct: d1.maxGainPct,
    nextSessionLowExcursionPct: d1.maxDrawdownPct,
    nextSessionClosePosition: d1.closePosition,
    nextSessionVolume: d1.sessionVolume,
    nextSessionRvol: d1.rvol,
    nextSessionContinuation: continuation,
    episodeDirection: input.episodeDirection,
  };
}
