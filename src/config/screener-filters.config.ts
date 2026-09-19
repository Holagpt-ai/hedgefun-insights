/**
 * Screener Filter / Trader Lens V2 architecture — configuration only.
 *
 * Dormant foundation. Does NOT replace production Trader Lens presets,
 * Discovery ranking, Trade Quality scoring, or live screener execution.
 */

import { TRADE_QUALITY_CATALYST_SCORES } from "@/config/trade-quality.config";

export const SCREENER_FILTER_VERSION = "v1" as const;
export type ScreenerFilterVersion = typeof SCREENER_FILTER_VERSION;

export const MISSING_DATA_POLICIES = ["EXCLUDE", "INCLUDE", "ONLY_UNKNOWN"] as const;
export type MissingDataPolicy = (typeof MISSING_DATA_POLICIES)[number];

/** V1 default: missing/unknown values fail the clause with DATA_UNAVAILABLE. */
export const DEFAULT_MISSING_DATA_POLICY: MissingDataPolicy = "EXCLUDE";

export const NUMERIC_FILTER_OPERATORS = ["GTE", "GT", "LTE", "LT", "BETWEEN"] as const;
export const CATEGORICAL_FILTER_OPERATORS = ["EQ", "IN", "NOT_IN"] as const;
export const TRISTATE_FILTER_OPERATORS = ["IS_TRUE", "IS_FALSE", "IS_KNOWN", "IS_UNKNOWN"] as const;

export type NumericFilterOperator = (typeof NUMERIC_FILTER_OPERATORS)[number];
export type CategoricalFilterOperator = (typeof CATEGORICAL_FILTER_OPERATORS)[number];
export type TriStateFilterOperator = (typeof TRISTATE_FILTER_OPERATORS)[number];
export type ScreenerFilterOperator =
  | NumericFilterOperator
  | CategoricalFilterOperator
  | TriStateFilterOperator;

export const SCREENER_FILTER_FIELDS = [
  "price",
  "currentSessionVolume",
  "dollarVolume",
  "movePct",
  "absoluteMovePct",
  "rvol20d",
  "volumeRatioPrior",
  "float",
  "floatTurnover",
  "tradeQualityScore",
  "catalystQuality",
  "catalystPresence",
  "spreadPct",
  "marketCap",
  "vwapState",
  "distanceFromHodPct",
  "instrumentType",
  "sessionState",
] as const;

export type ScreenerFilterField = (typeof SCREENER_FILTER_FIELDS)[number];

export type ScreenerFilterFieldKind = "numeric" | "categorical" | "tristate";

/**
 * Canonical VWAP relationship values.
 * Reuses Radar `vwap_side` vocabulary (`above` / `below` / `unknown`) and
 * adds `at` for a future exact-touch state. The engine never computes VWAP.
 */
export const SCREENER_FILTER_VWAP_STATES = ["above", "below", "at", "unknown"] as const;
export type ScreenerFilterVwapState = (typeof SCREENER_FILTER_VWAP_STATES)[number];

/**
 * Authoritative Polygon / ticker_search instrument codes.
 * Do not infer type from ticker suffixes.
 */
export const SCREENER_FILTER_INSTRUMENT_TYPES = [
  "CS",
  "ETF",
  "ADRC",
  "WARRANT",
  "RIGHT",
  "UNIT",
  "PFD",
  "FUND",
  "SP",
  "UNKNOWN",
] as const;
export type ScreenerFilterInstrumentType = (typeof SCREENER_FILTER_INSTRUMENT_TYPES)[number];

/** Mirrors inbox / Radar session taxonomy. */
export const SCREENER_FILTER_SESSION_STATES = [
  "pre-market",
  "market",
  "after-hours",
  "closed",
] as const;
export type ScreenerFilterSessionState = (typeof SCREENER_FILTER_SESSION_STATES)[number];

export const SCREENER_FILTER_CATALYST_QUALITIES = [
  ...(Object.keys(TRADE_QUALITY_CATALYST_SCORES) as Array<
    keyof typeof TRADE_QUALITY_CATALYST_SCORES
  >),
  "UNKNOWN",
] as const;
export type ScreenerFilterCatalystQuality = (typeof SCREENER_FILTER_CATALYST_QUALITIES)[number];

export const AVAILABILITY_OPERATORS = ["IS_KNOWN", "IS_UNKNOWN"] as const;

export const SCREENER_FILTER_FIELD_KIND: Record<ScreenerFilterField, ScreenerFilterFieldKind> = {
  price: "numeric",
  currentSessionVolume: "numeric",
  dollarVolume: "numeric",
  movePct: "numeric",
  absoluteMovePct: "numeric",
  rvol20d: "numeric",
  volumeRatioPrior: "numeric",
  float: "numeric",
  floatTurnover: "numeric",
  tradeQualityScore: "numeric",
  catalystQuality: "categorical",
  catalystPresence: "tristate",
  spreadPct: "numeric",
  marketCap: "numeric",
  vwapState: "categorical",
  distanceFromHodPct: "numeric",
  instrumentType: "categorical",
  sessionState: "categorical",
};

function operatorsForKind(kind: ScreenerFilterFieldKind): readonly ScreenerFilterOperator[] {
  if (kind === "numeric") return [...NUMERIC_FILTER_OPERATORS, ...AVAILABILITY_OPERATORS];
  if (kind === "tristate") return TRISTATE_FILTER_OPERATORS;
  return [...CATEGORICAL_FILTER_OPERATORS, ...AVAILABILITY_OPERATORS];
}

export const SCREENER_FILTER_FIELD_OPERATORS: Record<
  ScreenerFilterField,
  readonly ScreenerFilterOperator[]
> = {
  price: operatorsForKind("numeric"),
  currentSessionVolume: operatorsForKind("numeric"),
  dollarVolume: operatorsForKind("numeric"),
  movePct: operatorsForKind("numeric"),
  absoluteMovePct: operatorsForKind("numeric"),
  rvol20d: operatorsForKind("numeric"),
  volumeRatioPrior: operatorsForKind("numeric"),
  float: operatorsForKind("numeric"),
  floatTurnover: operatorsForKind("numeric"),
  tradeQualityScore: operatorsForKind("numeric"),
  catalystQuality: operatorsForKind("categorical"),
  catalystPresence: operatorsForKind("tristate"),
  spreadPct: operatorsForKind("numeric"),
  marketCap: operatorsForKind("numeric"),
  vwapState: operatorsForKind("categorical"),
  distanceFromHodPct: operatorsForKind("numeric"),
  instrumentType: operatorsForKind("categorical"),
  sessionState: operatorsForKind("categorical"),
};

export const SCREENER_FILTER_CATEGORICAL_VALUES: Partial<
  Record<ScreenerFilterField, readonly string[]>
> = {
  catalystQuality: SCREENER_FILTER_CATALYST_QUALITIES,
  vwapState: SCREENER_FILTER_VWAP_STATES,
  instrumentType: SCREENER_FILTER_INSTRUMENT_TYPES,
  sessionState: SCREENER_FILTER_SESSION_STATES,
};

/**
 * Future declarative presets. Not wired to production Trader Lens UI.
 * Existing `scanner-presets.config.ts` remains authoritative for live Core Momentum.
 */
export const SCREENER_FILTER_PRESET_IDS = [
  "CORE_MOMENTUM",
  "LOW_FLOAT",
  "HIGH_RVOL",
  "HIGH_LIQUIDITY",
  "HIGH_TRADE_QUALITY",
  "POWER_HOUR",
  "CUSTOM",
] as const;

export type ScreenerFilterPresetId = (typeof SCREENER_FILTER_PRESET_IDS)[number];

/** Declarative future presets. Not wired to production Trader Lens. */
export const SCREENER_FILTER_PRESETS = {
  CORE_MOMENTUM: {
    id: "CORE_MOMENTUM",
    combinator: "AND" as const,
    filters: [
      { id: "price-band", field: "price", operator: "BETWEEN", min: 2, max: 20 },
      { id: "session-move", field: "movePct", operator: "GTE", value: 10 },
    ],
  },
  LOW_FLOAT: {
    id: "LOW_FLOAT",
    combinator: "AND" as const,
    filters: [{ id: "max-float", field: "float", operator: "LTE", value: 10_000_000 }],
  },
  HIGH_RVOL: {
    id: "HIGH_RVOL",
    combinator: "AND" as const,
    filters: [{ id: "min-rvol", field: "rvol20d", operator: "GTE", value: 5 }],
  },
  HIGH_LIQUIDITY: {
    id: "HIGH_LIQUIDITY",
    combinator: "AND" as const,
    filters: [{ id: "min-dollar-volume", field: "dollarVolume", operator: "GTE", value: 10_000_000 }],
  },
  HIGH_TRADE_QUALITY: {
    id: "HIGH_TRADE_QUALITY",
    combinator: "AND" as const,
    filters: [{ id: "min-tq", field: "tradeQualityScore", operator: "GTE", value: 70 }],
  },
  POWER_HOUR: {
    id: "POWER_HOUR",
    combinator: "AND" as const,
    filters: [{ id: "session-market", field: "sessionState", operator: "EQ", value: "market" }],
  },
  CUSTOM: {
    id: "CUSTOM",
    combinator: "AND" as const,
    filters: [],
  },
} as const;
