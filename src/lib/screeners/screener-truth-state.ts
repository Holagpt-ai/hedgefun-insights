import {
  NHL_TAB_ID,
  parseNhlBaselineStatus,
  type ScreenerUiStatus,
} from "@/lib/screeners/contract";
import type { ScreenerDataSource } from "@/lib/screeners/screener-copy";
import {
  getTabEvaluationEvidence,
  gappersEvidenceSupportsZeroMatch,
  nhlEvidenceSupportsZeroMatch,
  type GappersTabEvidence,
  type NhlTabEvidence,
  type TabEvaluationEvidenceMap,
} from "@/lib/screeners/tab-evaluation-evidence";

export type ScreenerTruthReason =
  | "validated_zero_matches"
  | "prerequisite_unavailable"
  | "baseline_initializing"
  | "baseline_unavailable"
  | "generation_unavailable"
  | "generation_stale"
  | "evaluated_with_results"
  | "evaluation_evidence_missing"
  | "loading";

export interface ScreenerTruthState {
  status: ScreenerUiStatus;
  reason: ScreenerTruthReason;
  title: string;
  explanation: string;
  showRows: boolean;
  showFreshness: boolean;
}

export interface ResolveScreenerTruthStateInput {
  tabId: string;
  status: ScreenerUiStatus;
  rowCount: number;
  syncedAt: string | null;
  nhlBaselineStatus?: unknown;
  tabEvaluationEvidence?: TabEvaluationEvidenceMap | null;
  source?: ScreenerDataSource | null;
}

const GENERIC_ZERO_TITLE = "No qualifying securities";
const GENERIC_ZERO_EXPLANATION =
  "No securities met this screener's criteria in the latest validated evaluation.";

const UNAVAILABLE_TITLE = "Screener unavailable";
const UNAVAILABLE_EXPLANATION =
  "Screener data is temporarily unavailable. No unverified rows are being shown.";

function nhlUnavailableCopy(): Pick<ScreenerTruthState, "title" | "explanation"> {
  return {
    title: "Baseline unavailable",
    explanation:
      "The validated 52-week baseline is unavailable, so this screener could not be evaluated.",
  };
}

function nhlInitializingCopy(): Pick<ScreenerTruthState, "title" | "explanation"> {
  return {
    title: "Baseline initializing",
    explanation: "Building the validated 52-week baseline. Results are not ready yet.",
  };
}

function nhlZeroMatchCopy(): Pick<ScreenerTruthState, "title" | "explanation"> {
  return {
    title: "Baseline ready",
    explanation:
      "Baseline ready. No securities reached a new 52-week high or low in the latest validated evaluation.",
  };
}

function gappersPrerequisiteCopy(): Pick<ScreenerTruthState, "title" | "explanation"> {
  return {
    title: "Gap inputs unavailable",
    explanation:
      "Prior-close and gap inputs were unavailable for this evaluation, so Gapper results could not be verified.",
  };
}

function evidenceMissingCopy(): Pick<ScreenerTruthState, "title" | "explanation"> {
  return {
    title: "Evaluation evidence unavailable",
    explanation:
      "Evaluation evidence for this tab is unavailable in the latest generation. No securities are being inferred.",
  };
}

function resolveEmptyReason(
  tabId: string,
  evidence: ReturnType<typeof getTabEvaluationEvidence>,
  nhlBaselineStatus: ReturnType<typeof parseNhlBaselineStatus>,
): ScreenerTruthReason {
  if (tabId === NHL_TAB_ID) {
    if (nhlBaselineStatus === "initializing") return "baseline_initializing";
    if (nhlBaselineStatus === "unavailable") return "baseline_unavailable";
    const nhlEvidence = evidence as NhlTabEvidence | null;
    if (nhlEvidenceSupportsZeroMatch(nhlEvidence)) return "validated_zero_matches";
    if (nhlEvidence?.status === "not_evaluated") return "evaluation_evidence_missing";
    return "evaluation_evidence_missing";
  }

  if (tabId === "gappers") {
    const gappersEvidence = evidence as GappersTabEvidence | null;
    if (!gappersEvidence) return "evaluation_evidence_missing";
    if (gappersEvidence.status === "prerequisite_unavailable") {
      return "prerequisite_unavailable";
    }
    if (gappersEvidenceSupportsZeroMatch(gappersEvidence)) {
      return "validated_zero_matches";
    }
    return "evaluation_evidence_missing";
  }

  if (evidence && "status" in evidence) {
    if (evidence.status === "prerequisite_unavailable") return "prerequisite_unavailable";
    if (evidence.status === "evaluated" && evidence.qualified_count === 0) {
      return "validated_zero_matches";
    }
  }

  return "evaluation_evidence_missing";
}

function copyForReason(
  tabId: string,
  reason: ScreenerTruthReason,
): Pick<ScreenerTruthState, "title" | "explanation"> {
  switch (reason) {
    case "baseline_initializing":
      return nhlInitializingCopy();
    case "baseline_unavailable":
      return nhlUnavailableCopy();
    case "validated_zero_matches":
      return tabId === NHL_TAB_ID ? nhlZeroMatchCopy() : {
        title: GENERIC_ZERO_TITLE,
        explanation: GENERIC_ZERO_EXPLANATION,
      };
    case "prerequisite_unavailable":
      return tabId === "gappers"
        ? gappersPrerequisiteCopy()
        : {
            title: "Prerequisites unavailable",
            explanation:
              "Required evaluation inputs were unavailable, so this screener could not be verified.",
          };
    case "evaluation_evidence_missing":
      return evidenceMissingCopy();
    case "generation_unavailable":
      return tabId === NHL_TAB_ID
        ? nhlUnavailableCopy()
        : { title: UNAVAILABLE_TITLE, explanation: UNAVAILABLE_EXPLANATION };
    case "generation_stale":
      return {
        title: "Stale delayed snapshot",
        explanation:
          "These rows are a delayed snapshot, not current market opportunities.",
      };
    case "evaluated_with_results":
      return { title: "Results available", explanation: "" };
    case "loading":
      return { title: "Loading", explanation: "" };
    default:
      return { title: UNAVAILABLE_TITLE, explanation: UNAVAILABLE_EXPLANATION };
  }
}

/**
 * Canonical truth-state resolver for screener-results tabs rendered via
 * ScreenerTable (desktop + mobile). Day Trade Radar V2 uses Radar Sentinel
 * copy and remains outside this contract by design.
 */
export function resolveScreenerTruthState(
  input: ResolveScreenerTruthStateInput,
): ScreenerTruthState {
  const {
    tabId,
    status,
    rowCount,
    syncedAt,
    nhlBaselineStatus,
    tabEvaluationEvidence,
    source,
  } = input;

  const nhlStatus = parseNhlBaselineStatus(nhlBaselineStatus);
  const evidence = getTabEvaluationEvidence(tabEvaluationEvidence ?? null, tabId);
  const hasSyncedAt = syncedAt !== null && syncedAt !== undefined && syncedAt !== "";

  if (status === "loading") {
    return {
      status,
      reason: "loading",
      title: "Loading",
      explanation: "",
      showRows: false,
      showFreshness: false,
    };
  }

  if (status === "unavailable") {
    const reason =
      tabId === NHL_TAB_ID && nhlStatus === "unavailable"
        ? "baseline_unavailable"
        : "generation_unavailable";
    const copy = copyForReason(tabId, reason);
    return {
      status,
      reason,
      ...copy,
      showRows: false,
      showFreshness: false,
    };
  }

  if (status === "initializing") {
    return {
      status,
      reason: "baseline_initializing",
      ...nhlInitializingCopy(),
      showRows: false,
      showFreshness: hasSyncedAt,
    };
  }

  if (status === "stale") {
    const copy = copyForReason(tabId, "generation_stale");
    return {
      status,
      reason: "generation_stale",
      ...copy,
      showRows: rowCount > 0,
      showFreshness: hasSyncedAt,
    };
  }

  if (status === "available" && rowCount > 0) {
    return {
      status,
      reason: "evaluated_with_results",
      title: "Results available",
      explanation: "",
      showRows: true,
      showFreshness: hasSyncedAt,
    };
  }

  if (status === "empty" || (status === "available" && rowCount === 0)) {
    const reason = resolveEmptyReason(tabId, evidence, nhlStatus);
    const copy = copyForReason(tabId, reason);
    return {
      status: "empty",
      reason,
      ...copy,
      showRows: false,
      showFreshness: hasSyncedAt && source !== "radar-v2",
    };
  }

  return {
    status: "unavailable",
    reason: "generation_unavailable",
    title: UNAVAILABLE_TITLE,
    explanation: UNAVAILABLE_EXPLANATION,
    showRows: false,
    showFreshness: false,
  };
}
