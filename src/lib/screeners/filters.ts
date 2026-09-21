/**
 * Isolated Screener Filter engine (Trader Lens V2 foundation).
 *
 * Visibility filtering only. Preserves input order and original Discovery ranks.
 * Does not sort, re-rank, or call Trade Quality / Discovery engines.
 */

import {
  DEFAULT_MISSING_DATA_POLICY,
  SCREENER_FILTER_CATEGORICAL_VALUES,
  SCREENER_FILTER_FIELD_KIND,
  SCREENER_FILTER_FIELD_OPERATORS,
  SCREENER_FILTER_FIELDS,
  SCREENER_FILTER_VERSION,
  type MissingDataPolicy,
  type ScreenerFilterField,
  type ScreenerFilterOperator,
} from "@/config/screener-filters.config";
import { isFiniteNumber, isPositiveFinite } from "@/lib/screeners/contract";
import { computeDollarVolume } from "@/lib/screeners/dollar-volume";
import type {
  ScreenerFilterApplyResult,
  ScreenerFilterCandidate,
  ScreenerFilterClause,
  ScreenerFilterEvaluation,
  ScreenerFilterExpected,
  ScreenerFilterFailure,
  ScreenerFilterSet,
  ScreenerFilterTriState,
  ScreenerFilterValidationError,
  ScreenerFilterValidationResult,
} from "@/types/screener-filters";

const FIELD_SET = new Set<string>(SCREENER_FILTER_FIELDS);

export function isScreenerFilterField(value: unknown): value is ScreenerFilterField {
  return typeof value === "string" && FIELD_SET.has(value);
}

function isFilterClause(value: unknown): value is ScreenerFilterClause {
  return typeof value === "object" && value !== null && "field" in value && "operator" in value;
}

function operatorAllowed(field: ScreenerFilterField, operator: ScreenerFilterOperator): boolean {
  return SCREENER_FILTER_FIELD_OPERATORS[field].includes(operator);
}

function expectedFromClause(clause: ScreenerFilterClause): ScreenerFilterExpected {
  return {
    operator: clause.operator,
    value: clause.value ?? null,
    values: clause.values,
    min: clause.min ?? null,
    max: clause.max ?? null,
  };
}

function finiteBound(value: unknown): value is number {
  return isFiniteNumber(value);
}

export function validateScreenerFilterSet(
  filterSet: ScreenerFilterSet,
): ScreenerFilterValidationResult {
  const errors: ScreenerFilterValidationError[] = [];

  if (!filterSet || typeof filterSet !== "object") {
    return { ok: false, errors: [{ reason: "INVALID_FILTER", message: "Filter set is required." }] };
  }

  if (typeof filterSet.id !== "string" || filterSet.id.trim() === "") {
    errors.push({ reason: "INVALID_FILTER", message: "Filter set id is required." });
  }

  if (filterSet.combinator === "OR") {
    errors.push({
      reason: "INVALID_FILTER",
      message: "V1 filter sets support AND composition only.",
    });
  }

  if (!Array.isArray(filterSet.filters)) {
    errors.push({ reason: "INVALID_FILTER", message: "Filter set filters must be an array." });
    return { ok: false, errors };
  }

  for (const clause of filterSet.filters) {
    if (!isFilterClause(clause) || typeof clause.id !== "string" || clause.id.trim() === "") {
      errors.push({ reason: "INVALID_FILTER", message: "Each filter requires a non-empty id." });
      continue;
    }

    if (!isScreenerFilterField(clause.field)) {
      errors.push({
        filterId: clause.id,
        reason: "INVALID_FILTER",
        message: `Unsupported field: ${String(clause.field)}.`,
      });
      continue;
    }

    if (!operatorAllowed(clause.field, clause.operator)) {
      errors.push({
        filterId: clause.id,
        reason: "INVALID_FILTER",
        message: `Operator ${clause.operator} is not valid for ${clause.field}.`,
      });
      continue;
    }

    const kind = SCREENER_FILTER_FIELD_KIND[clause.field];

    if (clause.operator === "BETWEEN") {
      if (!finiteBound(clause.min) || !finiteBound(clause.max)) {
        errors.push({
          filterId: clause.id,
          reason: "INVALID_FILTER",
          message: "BETWEEN requires finite min and max bounds.",
        });
        continue;
      }
      if (clause.min > clause.max) {
        errors.push({
          filterId: clause.id,
          reason: "INVALID_FILTER",
          message: "BETWEEN min must be less than or equal to max.",
        });
      }
      continue;
    }

    if (
      clause.operator === "GTE" ||
      clause.operator === "GT" ||
      clause.operator === "LTE" ||
      clause.operator === "LT"
    ) {
      if (!finiteBound(clause.value)) {
        errors.push({
          filterId: clause.id,
          reason: "INVALID_FILTER",
          message: `${clause.operator} requires a finite numeric value.`,
        });
      }
      continue;
    }

    if (clause.operator === "IN" || clause.operator === "NOT_IN") {
      if (!Array.isArray(clause.values) || clause.values.length === 0) {
        errors.push({
          filterId: clause.id,
          reason: "INVALID_FILTER",
          message: `${clause.operator} requires a non-empty values list.`,
        });
        continue;
      }
      const allowed = SCREENER_FILTER_CATEGORICAL_VALUES[clause.field];
      if (allowed) {
        for (const entry of clause.values) {
          if (typeof entry !== "string" || !allowed.includes(entry)) {
            errors.push({
              filterId: clause.id,
              reason: "INVALID_FILTER",
              message: `Malformed ${clause.field} value: ${String(entry)}.`,
            });
          }
        }
      }
      continue;
    }

    if (clause.operator === "EQ") {
      if (clause.value == null || typeof clause.value === "boolean") {
        errors.push({
          filterId: clause.id,
          reason: "INVALID_FILTER",
          message: "EQ requires a categorical value.",
        });
        continue;
      }
      const allowed = SCREENER_FILTER_CATEGORICAL_VALUES[clause.field];
      if (allowed && (typeof clause.value !== "string" || !allowed.includes(clause.value))) {
        errors.push({
          filterId: clause.id,
          reason: "INVALID_FILTER",
          message: `Malformed ${clause.field} value: ${String(clause.value)}.`,
        });
      }
      continue;
    }

    if (
      clause.operator === "IS_TRUE" ||
      clause.operator === "IS_FALSE" ||
      clause.operator === "IS_KNOWN" ||
      clause.operator === "IS_UNKNOWN"
    ) {
      if (clause.operator !== "IS_KNOWN" && clause.operator !== "IS_UNKNOWN" && kind !== "tristate") {
        errors.push({
          filterId: clause.id,
          reason: "INVALID_FILTER",
          message: `${clause.operator} is only valid for tri-state fields.`,
        });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

interface ResolvedField {
  available: boolean;
  value: number | string | boolean | null;
}

function isUnavailableSentinel(field: ScreenerFilterField, value: string): boolean {
  if (field === "catalystQuality" || field === "vwapState") {
    return value === "UNKNOWN" || value === "unknown";
  }
  return false;
}

function resolveNumeric(
  value: number | null | undefined,
  options?: { requirePositive?: boolean; allowZero?: boolean },
): ResolvedField {
  if (!isFiniteNumber(value)) return { available: false, value: null };
  if (options?.requirePositive && !isPositiveFinite(value)) {
    return { available: false, value: null };
  }
  if (options?.allowZero === false && value === 0) {
    return { available: false, value: null };
  }
  if (value < 0 && options?.requirePositive !== false && options?.allowZero) {
    return { available: false, value: null };
  }
  return { available: true, value };
}

function resolveNonNegative(value: number | null | undefined): ResolvedField {
  if (!isFiniteNumber(value) || value < 0) return { available: false, value: null };
  return { available: true, value };
}

function resolveSigned(value: number | null | undefined): ResolvedField {
  if (!isFiniteNumber(value)) return { available: false, value: null };
  return { available: true, value };
}

function resolveFloatTurnover(candidate: ScreenerFilterCandidate): ResolvedField {
  if (isFiniteNumber(candidate.floatTurnover) && candidate.floatTurnover >= 0) {
    return { available: true, value: candidate.floatTurnover };
  }
  const volume = candidate.currentSessionVolume;
  const floatShares = candidate.float;
  if (!isFiniteNumber(volume) || volume < 0 || !isPositiveFinite(floatShares)) {
    return { available: false, value: null };
  }
  const turnover = volume / floatShares;
  if (!Number.isFinite(turnover) || turnover < 0) return { available: false, value: null };
  return { available: true, value: turnover };
}

function resolveDollarVolume(candidate: ScreenerFilterCandidate): ResolvedField {
  if (isFiniteNumber(candidate.dollarVolume) && candidate.dollarVolume >= 0) {
    return { available: true, value: candidate.dollarVolume };
  }
  const computed = computeDollarVolume(candidate.price, candidate.currentSessionVolume);
  if (computed === null) return { available: false, value: null };
  return { available: true, value: computed };
}

function resolveTradeQualityScore(candidate: ScreenerFilterCandidate): ResolvedField {
  if (candidate.tradeQualityLabel === "INCOMPLETE") {
    return { available: false, value: null };
  }
  if (!isFiniteNumber(candidate.tradeQualityScore) || candidate.tradeQualityScore < 0) {
    return { available: false, value: null };
  }
  return { available: true, value: candidate.tradeQualityScore };
}

function resolveCatalystQuality(candidate: ScreenerFilterCandidate): ResolvedField {
  const quality = candidate.catalystQuality;
  if (quality == null || quality === "UNKNOWN") return { available: false, value: null };
  return { available: true, value: quality };
}

function resolveCatalystPresence(candidate: ScreenerFilterCandidate): ResolvedField {
  const quality = candidate.catalystQuality;
  if (quality == null || quality === "UNKNOWN") return { available: false, value: null };
  if (quality === "NONE") return { available: true, value: "FALSE" };
  return { available: true, value: "TRUE" };
}

function resolveCategorical(
  value: string | null | undefined,
  field: ScreenerFilterField,
): ResolvedField {
  if (typeof value !== "string" || value.trim() === "") {
    return { available: false, value: null };
  }
  const normalized = field === "instrumentType" ? value.trim().toUpperCase() : value;
  if (isUnavailableSentinel(field, normalized)) return { available: false, value: null };
  if (field === "instrumentType" && normalized === "UNKNOWN") {
    return { available: true, value: "UNKNOWN" };
  }
  return { available: true, value: normalized };
}

export function resolveScreenerFilterField(
  candidate: ScreenerFilterCandidate,
  field: ScreenerFilterField,
): ResolvedField {
  switch (field) {
    case "price":
      return resolveNumeric(candidate.price, { requirePositive: true });
    case "currentSessionVolume":
      return resolveNonNegative(candidate.currentSessionVolume);
    case "dollarVolume":
      return resolveDollarVolume(candidate);
    case "movePct":
      return resolveSigned(candidate.movePct);
    case "absoluteMovePct":
      return resolveNonNegative(candidate.absoluteMovePct);
    case "rvol20d":
      return resolveNonNegative(candidate.rvol20d);
    case "volumeRatioPrior":
      return resolveNonNegative(candidate.volumeRatioPrior);
    case "float":
      return resolveNumeric(candidate.float, { requirePositive: true });
    case "floatTurnover":
      return resolveFloatTurnover(candidate);
    case "tradeQualityScore":
      return resolveTradeQualityScore(candidate);
    case "catalystQuality":
      return resolveCatalystQuality(candidate);
    case "catalystPresence":
      return resolveCatalystPresence(candidate);
    case "spreadPct":
      return resolveNonNegative(candidate.spreadPct);
    case "marketCap":
      return resolveNonNegative(candidate.marketCap);
    case "vwapState":
      return resolveCategorical(candidate.vwapState, field);
    case "distanceFromHodPct":
      return resolveSigned(candidate.distanceFromHodPct);
    case "instrumentType":
      return resolveCategorical(candidate.instrumentType, field);
    case "sessionState":
      return resolveCategorical(candidate.sessionState, field);
  }
}

function missingPolicy(
  clause: ScreenerFilterClause,
  filterSet: ScreenerFilterSet,
): MissingDataPolicy {
  return clause.missingDataPolicy ?? filterSet.missingDataPolicy ?? DEFAULT_MISSING_DATA_POLICY;
}

function applyMissingPolicy(
  policy: MissingDataPolicy,
  clause: ScreenerFilterClause,
  actual: number | string | boolean | null,
): ScreenerFilterFailure | null {
  if (policy === "INCLUDE") return null;
  if (policy === "ONLY_UNKNOWN") return null;
  return {
    filterId: clause.id,
    field: clause.field,
    reason: "DATA_UNAVAILABLE",
    actual,
    expected: expectedFromClause(clause),
  };
}

function evaluateNumeric(
  actual: number,
  clause: ScreenerFilterClause,
): boolean {
  switch (clause.operator) {
    case "GTE":
      return actual >= (clause.value as number);
    case "GT":
      return actual > (clause.value as number);
    case "LTE":
      return actual <= (clause.value as number);
    case "LT":
      return actual < (clause.value as number);
    case "BETWEEN":
      return actual >= (clause.min as number) && actual <= (clause.max as number);
    default:
      return false;
  }
}

function evaluateClause(
  candidate: ScreenerFilterCandidate,
  clause: ScreenerFilterClause,
  filterSet: ScreenerFilterSet,
): ScreenerFilterFailure | null {
  const resolved = resolveScreenerFilterField(candidate, clause.field);
  const policy = missingPolicy(clause, filterSet);

  if (clause.operator === "IS_UNKNOWN") {
    return resolved.available
      ? {
          filterId: clause.id,
          field: clause.field,
          reason: "VALUE_NOT_ALLOWED",
          actual: resolved.value,
          expected: expectedFromClause(clause),
        }
      : null;
  }

  if (clause.operator === "IS_KNOWN") {
    return resolved.available
      ? null
      : {
          filterId: clause.id,
          field: clause.field,
          reason: "DATA_UNAVAILABLE",
          actual: resolved.value,
          expected: expectedFromClause(clause),
        };
  }

  if (!resolved.available) {
    if (policy === "ONLY_UNKNOWN") return null;
    return applyMissingPolicy(policy, clause, resolved.value);
  }

  if (policy === "ONLY_UNKNOWN") {
    return {
      filterId: clause.id,
      field: clause.field,
      reason: "VALUE_NOT_ALLOWED",
      actual: resolved.value,
      expected: expectedFromClause(clause),
    };
  }

  if (clause.operator === "IS_TRUE" || clause.operator === "IS_FALSE") {
    const expected: ScreenerFilterTriState = clause.operator === "IS_TRUE" ? "TRUE" : "FALSE";
    if (resolved.value === expected) return null;
    return {
      filterId: clause.id,
      field: clause.field,
      reason: "VALUE_NOT_ALLOWED",
      actual: resolved.value,
      expected: expectedFromClause(clause),
    };
  }

  if (clause.operator === "EQ") {
    if (resolved.value === clause.value) return null;
    return {
      filterId: clause.id,
      field: clause.field,
      reason: "VALUE_NOT_ALLOWED",
      actual: resolved.value,
      expected: expectedFromClause(clause),
    };
  }

  if (clause.operator === "IN") {
    const allowed = clause.values ?? [];
    if (allowed.includes(resolved.value as string | number)) return null;
    return {
      filterId: clause.id,
      field: clause.field,
      reason: "VALUE_NOT_ALLOWED",
      actual: resolved.value,
      expected: expectedFromClause(clause),
    };
  }

  if (clause.operator === "NOT_IN") {
    const denied = clause.values ?? [];
    if (!denied.includes(resolved.value as string | number)) return null;
    return {
      filterId: clause.id,
      field: clause.field,
      reason: "VALUE_NOT_ALLOWED",
      actual: resolved.value,
      expected: expectedFromClause(clause),
    };
  }

  if (typeof resolved.value !== "number") {
    return {
      filterId: clause.id,
      field: clause.field,
      reason: "VALUE_NOT_ALLOWED",
      actual: resolved.value,
      expected: expectedFromClause(clause),
    };
  }

  if (evaluateNumeric(resolved.value, clause)) return null;

  return {
    filterId: clause.id,
    field: clause.field,
    reason: "VALUE_OUT_OF_RANGE",
    actual: resolved.value,
    expected: expectedFromClause(clause),
  };
}

export function evaluateScreenerCandidate(
  candidate: ScreenerFilterCandidate,
  filterSet: ScreenerFilterSet,
): ScreenerFilterEvaluation {
  const failures: ScreenerFilterFailure[] = [];
  for (const clause of filterSet.filters) {
    const failure = evaluateClause(candidate, clause, filterSet);
    if (failure) failures.push(failure);
  }
  return {
    symbol: candidate.symbol,
    discoveryRank: candidate.discoveryRank,
    passes: failures.length === 0,
    failures,
  };
}

/**
 * Apply a declarative filter set.
 *
 * Preserves input order. Never mutates candidates or Discovery ranks.
 * Empty filter list returns the input set unchanged (copied).
 */
export function applyScreenerFilters<T extends ScreenerFilterCandidate>(
  candidates: readonly T[],
  filterSet: ScreenerFilterSet,
): ScreenerFilterApplyResult<T> {
  const validation = validateScreenerFilterSet(filterSet);
  if (!validation.ok) {
    return {
      ok: false,
      version: SCREENER_FILTER_VERSION,
      passed: [],
      rejected: [],
      evaluations: [],
      errors: validation.errors,
    };
  }

  const passed: T[] = [];
  const rejected: T[] = [];
  const evaluations: ScreenerFilterEvaluation[] = [];

  for (const candidate of candidates) {
    const evaluation = evaluateScreenerCandidate(candidate, filterSet);
    evaluations.push(evaluation);
    if (evaluation.passes) passed.push(candidate);
    else rejected.push(candidate);
  }

  return {
    ok: true,
    version: SCREENER_FILTER_VERSION,
    passed,
    rejected,
    evaluations,
    errors: [],
  };
}
