import {
  MANAGED_TAB_IDS,
  NHL_TAB_ID,
  parseNhlBaselineStatus,
  type ManagedTabId,
  type NhlBaselineStatus,
} from "@/lib/screeners/contract";

export type TabEvidenceEvaluationStatus = "evaluated" | "prerequisite_unavailable";

export interface GappersTabEvidence {
  status: TabEvidenceEvaluationStatus;
  universe_count: number;
  volume_positive_count: number;
  gap_calculable_count: number;
  no_prior_session_count?: number;
  unresolved_gap_input_count?: number;
  qualified_count: number;
  selected_count: number;
  reason?: string;
}

export interface NhlTabEvidence {
  status: "evaluated" | "not_evaluated";
  baseline_status: NhlBaselineStatus;
  baseline_quote_count: number;
  universe_count: number;
  eligible_count?: number;
  evaluated_count?: number;
  policy_excluded_count?: number;
  unresolved_count?: number;
  qualified_count?: number;
  selected_count: number;
  reason?: string;
}

export interface GenericTabEvidence {
  status: TabEvidenceEvaluationStatus;
  universe_count: number;
  qualified_count: number;
  selected_count: number;
  reason?: string;
}

export type TabEvaluationEvidence =
  | GappersTabEvidence
  | NhlTabEvidence
  | GenericTabEvidence;

export type TabEvaluationEvidenceMap = Partial<
  Record<ManagedTabId, TabEvaluationEvidence>
>;

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseGenericTabEvidence(raw: unknown): GenericTabEvidence | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.status !== "evaluated" && obj.status !== "prerequisite_unavailable") {
    return null;
  }
  if (
    !isNonNegativeInt(obj.universe_count) ||
    !isNonNegativeInt(obj.qualified_count) ||
    !isNonNegativeInt(obj.selected_count)
  ) {
    return null;
  }
  return {
    status: obj.status,
    universe_count: obj.universe_count,
    qualified_count: obj.qualified_count,
    selected_count: obj.selected_count,
    reason: typeof obj.reason === "string" ? obj.reason : undefined,
  };
}

function parseGappersTabEvidence(raw: unknown): GappersTabEvidence | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.status !== "evaluated" && obj.status !== "prerequisite_unavailable") {
    return null;
  }
  if (
    !isNonNegativeInt(obj.universe_count) ||
    !isNonNegativeInt(obj.volume_positive_count) ||
    !isNonNegativeInt(obj.gap_calculable_count) ||
    !isNonNegativeInt(obj.qualified_count) ||
    !isNonNegativeInt(obj.selected_count)
  ) {
    return null;
  }
  const volume_positive_count = obj.volume_positive_count;
  if (
    obj.no_prior_session_count !== undefined &&
    !isNonNegativeInt(obj.no_prior_session_count)
  ) {
    return null;
  }
  if (
    obj.unresolved_gap_input_count !== undefined &&
    !isNonNegativeInt(obj.unresolved_gap_input_count)
  ) {
    return null;
  }
  return {
    status: obj.status,
    universe_count: obj.universe_count,
    volume_positive_count,
    gap_calculable_count: obj.gap_calculable_count,
    no_prior_session_count: obj.no_prior_session_count as number | undefined,
    unresolved_gap_input_count: obj.unresolved_gap_input_count as number | undefined,
    qualified_count: obj.qualified_count,
    selected_count: obj.selected_count,
    reason: typeof obj.reason === "string" ? obj.reason : undefined,
  };
}

function parseNhlTabEvidence(raw: unknown): NhlTabEvidence | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.status !== "evaluated" && obj.status !== "not_evaluated") return null;
  const baseline_status = parseNhlBaselineStatus(obj.baseline_status);
  if (
    !isNonNegativeInt(obj.universe_count) ||
    !isNonNegativeInt(obj.baseline_quote_count) ||
    !isNonNegativeInt(obj.selected_count)
  ) {
    return null;
  }
  const baseline_quote_count = obj.baseline_quote_count;
  if (obj.eligible_count !== undefined && !isNonNegativeInt(obj.eligible_count)) {
    return null;
  }
  if (obj.evaluated_count !== undefined && !isNonNegativeInt(obj.evaluated_count)) {
    return null;
  }
  if (obj.qualified_count !== undefined && !isNonNegativeInt(obj.qualified_count)) {
    return null;
  }
  if (
    obj.policy_excluded_count !== undefined &&
    !isNonNegativeInt(obj.policy_excluded_count)
  ) {
    return null;
  }
  if (obj.unresolved_count !== undefined && !isNonNegativeInt(obj.unresolved_count)) {
    return null;
  }
  return {
    status: obj.status,
    baseline_status,
    baseline_quote_count,
    universe_count: obj.universe_count,
    eligible_count: obj.eligible_count as number | undefined,
    evaluated_count: obj.evaluated_count as number | undefined,
    policy_excluded_count: obj.policy_excluded_count as number | undefined,
    unresolved_count: obj.unresolved_count as number | undefined,
    qualified_count: obj.qualified_count as number | undefined,
    selected_count: obj.selected_count,
    reason: typeof obj.reason === "string" ? obj.reason : undefined,
  };
}

export function parseTabEvaluationEvidence(
  raw: unknown,
): TabEvaluationEvidenceMap | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const out: TabEvaluationEvidenceMap = {};
  for (const key of Object.keys(obj)) {
    if (!(MANAGED_TAB_IDS as readonly string[]).includes(key)) return null;
    const tabId = key as ManagedTabId;
    const parsed =
      tabId === "gappers"
        ? parseGappersTabEvidence(obj[key])
        : tabId === NHL_TAB_ID
          ? parseNhlTabEvidence(obj[key])
          : parseGenericTabEvidence(obj[key]);
    if (!parsed) return null;
    out[tabId] = parsed;
  }
  return out;
}

export function getTabEvaluationEvidence(
  map: TabEvaluationEvidenceMap | null | undefined,
  tabId: string,
): TabEvaluationEvidence | null {
  if (!map) return null;
  return (map[tabId as ManagedTabId] as TabEvaluationEvidence | undefined) ?? null;
}

export function gappersEvidenceSupportsZeroMatch(
  evidence: GappersTabEvidence | null | undefined,
): boolean {
  if (!evidence || evidence.status !== "evaluated") return false;
  if (!isNonNegativeInt(evidence.no_prior_session_count)) return false;
  if (!isNonNegativeInt(evidence.unresolved_gap_input_count)) return false;
  return (
    evidence.universe_count > 0 &&
    evidence.volume_positive_count > 0 &&
    evidence.gap_calculable_count > 0 &&
    evidence.unresolved_gap_input_count === 0 &&
    evidence.gap_calculable_count + evidence.no_prior_session_count ===
      evidence.volume_positive_count &&
    evidence.qualified_count === 0 &&
    evidence.selected_count === 0
  );
}

export function nhlEvidenceSupportsZeroMatch(
  evidence: NhlTabEvidence | null | undefined,
): boolean {
  if (!evidence || evidence.status !== "evaluated") return false;
  if (evidence.baseline_status !== "available") return false;
  if (!isNonNegativeInt(evidence.eligible_count)) return false;
  if (!isNonNegativeInt(evidence.evaluated_count)) return false;
  if (!isNonNegativeInt(evidence.policy_excluded_count)) return false;
  if (!isNonNegativeInt(evidence.unresolved_count)) return false;
  if (!isNonNegativeInt(evidence.qualified_count)) return false;
  return (
    evidence.eligible_count > 0 &&
    evidence.unresolved_count === 0 &&
    evidence.evaluated_count + evidence.policy_excluded_count ===
      evidence.eligible_count &&
    evidence.qualified_count === 0 &&
    evidence.selected_count === 0
  );
}
