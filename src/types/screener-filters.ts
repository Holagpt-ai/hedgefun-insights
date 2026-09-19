import type {
  MissingDataPolicy,
  ScreenerFilterCatalystQuality,
  ScreenerFilterField,
  ScreenerFilterInstrumentType,
  ScreenerFilterOperator,
  ScreenerFilterPresetId,
  ScreenerFilterSessionState,
  ScreenerFilterVwapState,
  ScreenerFilterVersion,
} from "@/config/screener-filters.config";
import type { TradeQualityLabel } from "@/config/trade-quality.config";

export type {
  MissingDataPolicy,
  ScreenerFilterCatalystQuality,
  ScreenerFilterField,
  ScreenerFilterInstrumentType,
  ScreenerFilterOperator,
  ScreenerFilterPresetId,
  ScreenerFilterSessionState,
  ScreenerFilterVwapState,
};

export type ScreenerFilterTriState = "TRUE" | "FALSE" | "UNKNOWN";

/**
 * Normalized candidate for the isolated filter engine.
 * Callers supply already-ranked Discovery rows; this type never recomputes rank.
 */
export interface ScreenerFilterCandidate {
  symbol: string;
  discoveryRank: number;
  price?: number | null;
  currentSessionVolume?: number | null;
  dollarVolume?: number | null;
  /** Signed regular-session percent move. Distinct from absoluteMovePct. */
  movePct?: number | null;
  /** Absolute percent-move magnitude. Distinct from signed movePct. */
  absoluteMovePct?: number | null;
  /** Canonical RVOL 20D only — never legacy rvol or Vol/Prior. */
  rvol20d?: number | null;
  /** currentSessionVolume / prior valid session volume. */
  volumeRatioPrior?: number | null;
  float?: number | null;
  floatTurnover?: number | null;
  /** Official Trade Quality score only. Null / INCOMPLETE is unavailable. */
  tradeQualityScore?: number | null;
  tradeQualityLabel?: TradeQualityLabel | null;
  catalystQuality?: ScreenerFilterCatalystQuality | null;
  spreadPct?: number | null;
  marketCap?: number | null;
  vwapState?: ScreenerFilterVwapState | null;
  distanceFromHodPct?: number | null;
  /** Authoritative metadata only. Never inferred from ticker suffix. */
  instrumentType?: string | null;
  sessionState?: ScreenerFilterSessionState | null;
}

export type ScreenerFilterFailureReason =
  | "VALUE_OUT_OF_RANGE"
  | "VALUE_NOT_ALLOWED"
  | "DATA_UNAVAILABLE"
  | "INVALID_FILTER";

export interface ScreenerFilterExpected {
  operator: ScreenerFilterOperator;
  value?: number | string | boolean | null;
  values?: readonly (string | number)[];
  min?: number | null;
  max?: number | null;
}

export interface ScreenerFilterFailure {
  filterId: string;
  field: ScreenerFilterField;
  reason: ScreenerFilterFailureReason;
  actual?: number | string | boolean | null;
  expected?: ScreenerFilterExpected;
}

export interface ScreenerFilterEvaluation {
  symbol: string;
  discoveryRank: number;
  passes: boolean;
  failures: ScreenerFilterFailure[];
}

export interface ScreenerFilterClause {
  id: string;
  field: ScreenerFilterField;
  operator: ScreenerFilterOperator;
  value?: number | string | boolean | null;
  values?: readonly (string | number)[];
  min?: number | null;
  max?: number | null;
  missingDataPolicy?: MissingDataPolicy;
}

/**
 * Reserved for a later OR/group expansion. V1 evaluates a flat AND list only.
 */
export interface ScreenerFilterGroup {
  combinator: "AND" | "OR";
  filters: readonly ScreenerFilterNode[];
}

export type ScreenerFilterNode = ScreenerFilterClause | ScreenerFilterGroup;

export interface ScreenerFilterSet {
  id: string;
  version?: ScreenerFilterVersion;
  /** V1 supports AND only. OR is typed for later groups and rejected at validation. */
  combinator?: "AND" | "OR";
  filters: readonly ScreenerFilterClause[];
  missingDataPolicy?: MissingDataPolicy;
}

export interface ScreenerFilterValidationError {
  filterId?: string;
  reason: "INVALID_FILTER";
  message: string;
}

export interface ScreenerFilterValidationResult {
  ok: boolean;
  errors: ScreenerFilterValidationError[];
}

export interface ScreenerFilterApplyResult<T extends ScreenerFilterCandidate> {
  ok: boolean;
  version: ScreenerFilterVersion;
  passed: T[];
  rejected: T[];
  evaluations: ScreenerFilterEvaluation[];
  errors: ScreenerFilterValidationError[];
}

export interface ScreenerFilterPresetDefinition {
  id: ScreenerFilterPresetId;
  label: string;
  filterSet: ScreenerFilterSet;
}
