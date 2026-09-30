import type { EvidenceRecord, VerificationState } from "./types.ts";
import { verificationConfidence, verifyEvidence } from "./evidence.ts";

export { verificationConfidence, verifyEvidence };

export function verifyFromEvidence(evidence: readonly EvidenceRecord[]): VerificationState {
  return verifyEvidence(evidence);
}
