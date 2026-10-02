import type { AttributionDecision } from "./attribution.ts";

/** Machine-readable unresolved attribution codes for Catalyst Intelligence ingestion. */
export type UnresolvedAttributionReason =
  | "NO_CIK_TICKER_MAPPING"
  | "MULTIPLE_CIK_TICKERS"
  | "AMBIGUOUS_COMPANY_ALIAS"
  | "AMBIGUOUS_TICKER_MENTION"
  | "PROVIDER_TICKER_CONFLICT"
  | "NO_ATTRIBUTION";

export function unresolvedAttributionReason(note: string): UnresolvedAttributionReason {
  switch (note) {
    case "cik_unmapped":
      return "NO_CIK_TICKER_MAPPING";
    case "ambiguous_cik":
      return "MULTIPLE_CIK_TICKERS";
    case "ambiguous_alias":
      return "AMBIGUOUS_COMPANY_ALIAS";
    case "ambiguous_mention":
      return "AMBIGUOUS_TICKER_MENTION";
    default:
      return "NO_ATTRIBUTION";
  }
}

export function attributionDiagnostics(decision: AttributionDecision): {
  unresolvedReason: UnresolvedAttributionReason | null;
} {
  if (decision.status === "resolved") return { unresolvedReason: null };
  return { unresolvedReason: decision.unresolvedReason ?? unresolvedAttributionReason(decision.note) };
}
