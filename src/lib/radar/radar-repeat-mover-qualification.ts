import type { RepeatMoverEvidenceLabel } from "@/config/repeat-mover.config";
import type { BehaviorProfileSampleQuality } from "@/config/behavior-profile.config";
import type {
  RadarHistoricalAvailabilityState,
  RadarRepeatMoverEvidenceStrength,
  RadarRepeatMoverQualification,
} from "@/lib/radar/radar-repeat-movers-types";
import type { RepeatMoverContext } from "@/types/repeat-mover";

const MEANINGFUL_EVIDENCE: ReadonlySet<RepeatMoverEvidenceLabel> = new Set([
  "SIMILAR_PRIOR_EPISODES_FOUND",
  "RECURRING_MOVER",
]);

function evidenceStrengthFromQuality(
  quality: BehaviorProfileSampleQuality | null,
): RadarRepeatMoverEvidenceStrength {
  if (quality === "ROBUST" || quality === "ADEQUATE") return "STRONG";
  if (quality === "LIMITED") return "LIMITED";
  if (quality === "INSUFFICIENT") return "INSUFFICIENT";
  return "INSUFFICIENT";
}

export function deriveHistoricalAvailabilityState(input: {
  profileAvailable: boolean;
  sampleSizeQuality: BehaviorProfileSampleQuality | null;
  evidenceLabels: readonly RepeatMoverEvidenceLabel[];
}): RadarHistoricalAvailabilityState {
  if (!input.profileAvailable) return "UNAVAILABLE";
  if (
    input.sampleSizeQuality === "INSUFFICIENT"
    || input.sampleSizeQuality === "LIMITED"
    || input.evidenceLabels.includes("LIMITED_HISTORY")
  ) {
    return "LIMITED";
  }
  return "AVAILABLE";
}

/**
 * Qualification runs after Discovery ranking. Never adds tickers absent from Radar rows.
 */
export function qualifyRadarRepeatMover(input: {
  historicalContext: RepeatMoverContext | null | undefined;
}): RadarRepeatMoverQualification {
  const context = input.historicalContext;
  if (!context?.profile.profileAvailable) {
    return {
      qualifies: false,
      reasons: ["profile_unavailable"],
      evidenceStrength: "INSUFFICIENT",
    };
  }

  const labels = Array.isArray(context.evidenceLabels) ? context.evidenceLabels : [];
  const hasMeaningful = labels.some((label) => MEANINGFUL_EVIDENCE.has(label));
  if (!hasMeaningful) {
    return {
      qualifies: false,
      reasons: ["no_meaningful_historical_evidence"],
      evidenceStrength: evidenceStrengthFromQuality(context.profile.sampleSizeQuality),
    };
  }

  const strength = evidenceStrengthFromQuality(context.profile.sampleSizeQuality);
  const reasons: string[] = [];
  if (labels.includes("SIMILAR_PRIOR_EPISODES_FOUND")) reasons.push("similar_prior_episodes_found");
  if (labels.includes("RECURRING_MOVER")) reasons.push("recurring_mover");
  if (strength === "INSUFFICIENT") reasons.push("insufficient_sample_not_strong_evidence");

  return {
    qualifies: true,
    reasons,
    evidenceStrength: strength,
  };
}
