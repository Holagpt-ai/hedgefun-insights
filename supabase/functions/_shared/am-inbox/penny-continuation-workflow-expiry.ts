import type { PennyQualificationEvidenceKind } from "../screeners/penny-continuation-workflow-handoff-types.ts";
import type { PennySupplementalLabel } from "../screeners/penny-continuation-types.ts";
import { firstAmSessionDateAfterSource } from "./late-session-expiry.ts";

export function computePennyHandoffValidWindow(input: {
  sourceSessionDate: string;
  qualificationEvidenceKind: PennyQualificationEvidenceKind;
  supplementalLabels: readonly PennySupplementalLabel[];
}): { validFromSessionDate: string; validThroughSessionDate: string } {
  const carriesNext = input.supplementalLabels.includes("next_session_carry") ||
    input.qualificationEvidenceKind === "prior_session_capture";
  if (carriesNext) {
    const nextAm = firstAmSessionDateAfterSource(input.sourceSessionDate);
    return {
      validFromSessionDate: nextAm,
      validThroughSessionDate: nextAm,
    };
  }
  return {
    validFromSessionDate: input.sourceSessionDate,
    validThroughSessionDate: input.sourceSessionDate,
  };
}
