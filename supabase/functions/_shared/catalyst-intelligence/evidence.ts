import type { EvidenceRecord, EvidenceTier, VerificationState } from "./types.ts";

export function evidenceRole(tier: EvidenceTier): "primary" | "secondary" {
  return tier === "TIER_1_PRIMARY" ? "primary" : "secondary";
}

/**
 * Rule-driven verification. Price movement is not an input.
 * Tier 3 discovery cannot become verified without corroborating higher-tier evidence.
 */
export function verifyEvidence(evidence: readonly Pick<EvidenceRecord, "evidenceTier" | "conflict" | "sourceId">[]): VerificationState {
  if (evidence.length === 0) return "UNVERIFIED";
  if (evidence.some((row) => row.conflict)) return "CONFLICTING";
  const tier1 = evidence.filter((row) => row.evidenceTier === "TIER_1_PRIMARY");
  const tier2Sources = new Set(
    evidence.filter((row) => row.evidenceTier === "TIER_2_STRONG_SECONDARY").map((row) => row.sourceId),
  );
  if (tier1.length >= 1) return "VERIFIED_PRIMARY";
  if (tier2Sources.size >= 2) return "VERIFIED_MULTI_SOURCE";
  if (tier2Sources.size === 1) return "REPORTED";
  return "UNVERIFIED";
}

export function verificationConfidence(state: VerificationState): number {
  switch (state) {
    case "VERIFIED_PRIMARY":
      return 95;
    case "VERIFIED_MULTI_SOURCE":
      return 85;
    case "REPORTED":
      return 55;
    case "UNVERIFIED":
      return 25;
    case "CONFLICTING":
      return 20;
    case "INVALIDATED":
      return 0;
  }
}
