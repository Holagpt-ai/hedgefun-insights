/**
 * Screener Intelligence V2 data-quality contract helpers.
 *
 * Pure envelope factory. Does not score, filter, persist, or change live engines.
 */

import {
  DATA_FRESHNESS_RANK,
  DATA_QUALITY_CONTRACT_VERSION,
  DATA_QUALITY_FUTURE_CLOCK_SKEW_MS,
  DATA_QUALITY_METRIC_POLICIES,
  type DataFreshnessState,
  type DataProvenanceState,
  type DataQualityMetricId,
  type DataQualityMetricPolicy,
  type DataQualityState,
} from "@/config/data-quality.config";
import { isFiniteNumber, parseTimestampMs } from "@/lib/screeners/contract";
import type {
  DataQualityDiagnostic,
  DataValue,
  DataValueCreateOptions,
} from "@/types/data-quality";

function canonicalUtc(value: unknown): { iso: string | null; provided: boolean; invalid: boolean } {
  if (value === undefined || value === null || value === "") {
    return { iso: null, provided: false, invalid: false };
  }
  if (typeof value !== "string") return { iso: null, provided: true, invalid: true };
  const ms = parseTimestampMs(value);
  return { iso: ms === null ? null : new Date(ms).toISOString(), provided: true, invalid: ms === null };
}

function parseEvaluatedAt(value: string | number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return parseTimestampMs(value);
}

function resolvePolicy(
  metric: DataQualityMetricId | undefined,
  override?: DataValueCreateOptions["policyOverride"],
): DataQualityMetricPolicy | null {
  if (!metric) return override ? ({ ...DATA_QUALITY_METRIC_POLICIES.volume, ...override, id: "volume" } as DataQualityMetricPolicy) : null;
  return { ...DATA_QUALITY_METRIC_POLICIES[metric], ...override };
}

function timestampDiagnostics(options?: DataValueCreateOptions): DataQualityDiagnostic[] {
  const diagnostics: DataQualityDiagnostic[] = [];
  const fields = ["sourceAsOf", "observedAt", "fetchedAt", "computedAt"] as const;
  for (const field of fields) {
    const parsed = canonicalUtc(options?.[field]);
    if (parsed.invalid) {
      diagnostics.push({
        code: "INVALID_TIMESTAMP",
        field,
        message: `${field} is not a valid UTC timestamp.`,
      });
    }
  }
  const sourceAsOfMs = options?.sourceAsOf ? parseTimestampMs(options.sourceAsOf) : null;
  const evaluatedAtMs = parseEvaluatedAt(options?.evaluatedAt);
  if (sourceAsOfMs !== null && evaluatedAtMs !== null && sourceAsOfMs > evaluatedAtMs + DATA_QUALITY_FUTURE_CLOCK_SKEW_MS) {
    diagnostics.push({
      code: "FUTURE_TIMESTAMP",
      field: "sourceAsOf",
      message: "sourceAsOf is beyond the allowed clock-skew tolerance.",
    });
  }
  return diagnostics;
}

export function resolveUsability(
  qualityState: DataQualityState,
  freshnessState: DataFreshnessState,
  policy?: DataQualityMetricPolicy | null,
): Pick<DataValue<unknown>, "usableForScoring" | "usableForFiltering" | "usableForDisplay"> {
  if (qualityState === "UNAVAILABLE" || qualityState === "INVALID") {
    return { usableForScoring: false, usableForFiltering: false, usableForDisplay: false };
  }
  if (qualityState === "PARTIAL") {
    return { usableForScoring: false, usableForFiltering: false, usableForDisplay: true };
  }
  if (qualityState === "DISCREPANCY") {
    return { usableForScoring: false, usableForFiltering: false, usableForDisplay: true };
  }

  const staleDisplay = policy?.staleDisplayAllowed ?? true;
  const staleFilter = policy?.staleFilteringAllowed ?? false;
  const staleScore = policy?.staleScoringAllowed ?? false;
  const agingScore = policy?.agingScoringAllowed ?? true;
  const agingFilter = policy?.agingFilteringAllowed ?? true;

  if (freshnessState === "STALE") {
    return {
      usableForScoring: staleScore,
      usableForFiltering: staleFilter,
      usableForDisplay: staleDisplay,
    };
  }
  if (freshnessState === "UNKNOWN") {
    return { usableForScoring: false, usableForFiltering: false, usableForDisplay: true };
  }
  if (freshnessState === "AGING") {
    return {
      usableForScoring: agingScore,
      usableForFiltering: agingFilter,
      usableForDisplay: true,
    };
  }
  return { usableForScoring: true, usableForFiltering: true, usableForDisplay: true };
}

export function isUsableForScoring<T>(value: DataValue<T>): boolean {
  return value.usableForScoring && value.value !== null && value.qualityState !== "INVALID";
}

export function isUsableForFiltering<T>(value: DataValue<T>): boolean {
  return value.usableForFiltering && value.value !== null;
}

export function isUsableForDisplay<T>(value: DataValue<T>): boolean {
  return value.usableForDisplay;
}

export function validateNumericMetric(
  value: unknown,
  metric: DataQualityMetricId,
): { ok: true; value: number } | { ok: false; diagnostic: DataQualityDiagnostic } {
  const policy = DATA_QUALITY_METRIC_POLICIES[metric];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      ok: false,
      diagnostic: { code: "INVALID_NUMBER", field: metric, message: "Value is not a finite number." },
    };
  }
  if (policy.requiresPositive && !(value > 0)) {
    return {
      ok: false,
      diagnostic: { code: "OUT_OF_RANGE", field: metric, message: "Value must be finite and > 0." },
    };
  }
  if (!policy.allowsZero && value === 0) {
    return {
      ok: false,
      diagnostic: { code: "OUT_OF_RANGE", field: metric, message: "Zero is not valid for this metric." },
    };
  }
  if (!policy.allowsNegative && value < 0) {
    return {
      ok: false,
      diagnostic: { code: "OUT_OF_RANGE", field: metric, message: "Negative values are not valid for this metric." },
    };
  }
  return { ok: true, value };
}

function envelope<T>(
  qualityState: DataQualityState,
  value: T | null,
  options?: DataValueCreateOptions,
  extraDiagnostics: readonly DataQualityDiagnostic[] = [],
): DataValue<T> {
  const freshnessState = options?.freshnessState ?? "UNKNOWN";
  const provenance = options?.provenance ?? "UNKNOWN";
  const policy = resolvePolicy(options?.metric, options?.policyOverride);
  const timestampIssues = timestampDiagnostics(options);
  const hasFuture = timestampIssues.some((item) => item.code === "FUTURE_TIMESTAMP");
  const hasInvalidTs = timestampIssues.some((item) => item.code === "INVALID_TIMESTAMP");
  const resolvedQuality = hasFuture || hasInvalidTs ? "INVALID" : qualityState;
  const diagnostics = [...timestampIssues, ...(options?.diagnostics ?? []), ...extraDiagnostics];
  if (freshnessState === "STALE" && !diagnostics.some((item) => item.code === "STALE_DATA")) {
    diagnostics.push({ code: "STALE_DATA", message: "Value freshness is STALE." });
  }
  const usability = resolveUsability(resolvedQuality, freshnessState, policy);
  return {
    version: DATA_QUALITY_CONTRACT_VERSION,
    value: resolvedQuality === "INVALID" && qualityState !== "INVALID" ? null : value,
    qualityState: resolvedQuality,
    freshnessState,
    provenance,
    source: options?.source ?? null,
    sourceAsOf: canonicalUtc(options?.sourceAsOf).iso,
    observedAt: canonicalUtc(options?.observedAt).iso,
    fetchedAt: canonicalUtc(options?.fetchedAt).iso,
    computedAt: canonicalUtc(options?.computedAt).iso,
    ...usability,
    diagnostics,
    lineage: options?.lineage,
    metric: options?.metric,
  };
}

export function createUnavailableValue<T = never>(options?: DataValueCreateOptions): DataValue<T> {
  return envelope("UNAVAILABLE", null, options, [
    { code: "MISSING_VALUE", field: options?.metric, message: "No usable value exists." },
  ]);
}

export function createInvalidValue<T = never>(
  options?: DataValueCreateOptions,
  diagnostic?: DataQualityDiagnostic,
): DataValue<T> {
  return envelope("INVALID", null, options, [
    diagnostic ?? { code: "INVALID_NUMBER", field: options?.metric, message: "Value violates the data-quality contract." },
  ]);
}

export function createPartialValue<T>(
  value: T | null,
  options?: DataValueCreateOptions,
): DataValue<T> {
  return envelope("PARTIAL", value, options, [
    { code: "INSUFFICIENT_INPUTS", field: options?.metric, message: "Supporting data exists but the canonical value is incomplete." },
  ]);
}

export function createDiscrepancyValue<T>(
  value: T | null,
  options?: DataValueCreateOptions,
): DataValue<T> {
  return envelope("DISCREPANCY", value, {
    ...options,
    provenance: options?.provenance ?? "COMPOSITE",
  }, [
    { code: "SOURCE_DISCREPANCY", field: options?.metric, message: "Valid sources or derivations disagree." },
  ]);
}

export function createAuthoritativeValue<T>(
  value: T,
  options?: DataValueCreateOptions,
): DataValue<T> {
  if (options?.metric && typeof value === "number") {
    const validated = validateNumericMetric(value, options.metric);
    if ("diagnostic" in validated) return createInvalidValue(options, validated.diagnostic);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return createInvalidValue(options, {
      code: "INVALID_NUMBER",
      field: options?.metric,
      message: "NaN and Infinity are invalid.",
    });
  }
  return envelope("AUTHORITATIVE", value, {
    ...options,
    freshnessState: options?.freshnessState ?? "FRESH",
    provenance: options?.provenance ?? "PROVIDER",
  });
}

export function createDerivedValue<T>(
  value: T,
  options?: DataValueCreateOptions,
): DataValue<T> {
  if (options?.metric && typeof value === "number") {
    const validated = validateNumericMetric(value, options.metric);
    if ("diagnostic" in validated) return createInvalidValue(options, validated.diagnostic);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return createInvalidValue(options, {
      code: "INVALID_NUMBER",
      field: options?.metric,
      message: "NaN and Infinity are invalid.",
    });
  }
  return envelope("DERIVED", value, {
    ...options,
    freshnessState: options?.freshnessState ?? "FRESH",
    provenance: options?.provenance ?? "DERIVED",
  });
}

export function combineFreshness(
  states: readonly DataFreshnessState[],
): DataFreshnessState {
  if (states.length === 0) return "UNKNOWN";
  if (states.includes("UNKNOWN")) return "UNKNOWN";
  return states.reduce((worst, current) =>
    DATA_FRESHNESS_RANK[current] > DATA_FRESHNESS_RANK[worst] ? current : worst,
  );
}

export function deriveQualityState(
  inputs: readonly DataValue<unknown>[],
): DataQualityState {
  if (inputs.length === 0) return "UNAVAILABLE";
  if (inputs.some((item) => item.qualityState === "INVALID")) return "INVALID";
  if (inputs.some((item) => item.qualityState === "DISCREPANCY")) return "DISCREPANCY";
  if (inputs.some((item) => item.qualityState === "UNAVAILABLE")) {
    return inputs.some((item) => item.qualityState === "AUTHORITATIVE" || item.qualityState === "DERIVED" || item.qualityState === "PARTIAL")
      ? "PARTIAL"
      : "UNAVAILABLE";
  }
  if (inputs.some((item) => item.qualityState === "PARTIAL")) return "PARTIAL";
  return "DERIVED";
}

export function deriveFromInputs<T>(
  value: T | null,
  inputs: readonly DataValue<unknown>[],
  options?: DataValueCreateOptions,
): DataValue<T> {
  const quality = deriveQualityState(inputs);
  const freshness = combineFreshness(inputs.map((item) => item.freshnessState));
  const lineage = {
    inputs: inputs.map((item) => item.metric ?? item.source ?? "unknown"),
  };
  const nextOptions: DataValueCreateOptions = {
    ...options,
    freshnessState: options?.freshnessState ?? freshness,
    provenance: options?.provenance ?? "DERIVED",
    lineage: options?.lineage ?? lineage,
  };

  if (quality === "INVALID") {
    return createInvalidValue(nextOptions, {
      code: "UNSUPPORTED_DERIVATION",
      field: options?.metric,
      message: "A required input is INVALID.",
    });
  }
  if (quality === "DISCREPANCY") {
    return createDiscrepancyValue(null, nextOptions);
  }
  if (quality === "UNAVAILABLE") {
    return createUnavailableValue(nextOptions);
  }
  if (quality === "PARTIAL" || value === null) {
    return createPartialValue(value, nextOptions);
  }
  return createDerivedValue(value as T, nextOptions);
}

export function getMetricPolicy(metric: DataQualityMetricId): DataQualityMetricPolicy {
  return DATA_QUALITY_METRIC_POLICIES[metric];
}
