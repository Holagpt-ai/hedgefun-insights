/**
 * Short Float V1 — provider-neutral normalizer.
 *
 * Canonical short float is shares sold short / public float × 100.
 * Does not call providers, persist data, or change Discovery / Trade Quality / filters.
 */

import {
  SHORT_FLOAT_AGING_MAX_CALENDAR_DAYS,
  SHORT_FLOAT_AGING_USABLE_FOR_SCORING,
  SHORT_FLOAT_DISCREPANCY_TOLERANCE_PCT,
  SHORT_FLOAT_FRESH_MAX_CALENDAR_DAYS,
  SHORT_FLOAT_FRESHNESS_BASIS,
  SHORT_FLOAT_FUTURE_CLOCK_SKEW_MS,
  SHORT_FLOAT_MODEL_VERSION,
  SHORT_FLOAT_MS_PER_CALENDAR_DAY,
  SHORT_FLOAT_STALE_USABLE_FOR_SCORING,
  SHORT_FLOAT_UNKNOWN_FRESHNESS_USABLE_FOR_SCORING,
  type ShortFloatFreshnessState,
  type ShortFloatQualityState,
  type ShortFloatValueSource,
} from "@/config/short-float.config";
import { isFiniteNumber, isPositiveFinite, parseTimestampMs } from "@/lib/screeners/contract";
import type {
  ShortFloatConsumerView,
  ShortFloatDiagnostic,
  ShortFloatDiscrepancy,
  ShortFloatInput,
  ShortFloatNormalization,
  ShortFloatNormalizeOptions,
} from "@/types/short-float";

interface ParsedNumber {
  provided: boolean;
  value: number | null;
  invalid: boolean;
}

function diagnostic(code: string, message: string, field?: string): ShortFloatDiagnostic {
  return { code, message, field };
}

function parseNonNegative(value: number | null | undefined): ParsedNumber {
  if (value === undefined || value === null) return { provided: false, value: null, invalid: false };
  if (!isFiniteNumber(value) || value < 0) return { provided: true, value: null, invalid: true };
  return { provided: true, value, invalid: false };
}

function parsePositive(value: number | null | undefined): ParsedNumber {
  if (value === undefined || value === null) return { provided: false, value: null, invalid: false };
  if (!isPositiveFinite(value)) return { provided: true, value: null, invalid: true };
  return { provided: true, value, invalid: false };
}

function parseEvaluatedAtMs(value: string | number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return parseTimestampMs(value);
}

function toCanonicalUtc(value: unknown): { iso: string | null; provided: boolean; invalid: boolean } {
  if (value === undefined || value === null || value === "") {
    return { iso: null, provided: false, invalid: false };
  }
  if (typeof value !== "string") return { iso: null, provided: true, invalid: true };
  const iso = (() => {
    const ms = parseTimestampMs(value);
    return ms === null ? null : new Date(ms).toISOString();
  })();
  return { iso, provided: true, invalid: iso === null };
}

function deriveShortFloatPct(shortInterestShares: number, floatShares: number): number | null {
  const pct = (shortInterestShares / floatShares) * 100;
  if (!Number.isFinite(pct) || pct < 0) return null;
  return pct;
}

function resolveFreshness(
  sourceAsOfMs: number | null,
  evaluatedAtMs: number | null,
  clockSkewMs: number,
): {
  freshnessState: ShortFloatFreshnessState;
  ageCalendarDays: number | null;
  futureDated: boolean;
} {
  if (sourceAsOfMs === null || evaluatedAtMs === null) {
    return { freshnessState: "UNKNOWN", ageCalendarDays: null, futureDated: false };
  }
  if (sourceAsOfMs > evaluatedAtMs + clockSkewMs) {
    return { freshnessState: "UNKNOWN", ageCalendarDays: null, futureDated: true };
  }
  const ageMs = Math.max(0, evaluatedAtMs - sourceAsOfMs);
  const ageCalendarDays = Math.floor(ageMs / SHORT_FLOAT_MS_PER_CALENDAR_DAY);
  if (ageCalendarDays <= SHORT_FLOAT_FRESH_MAX_CALENDAR_DAYS) {
    return { freshnessState: "FRESH", ageCalendarDays, futureDated: false };
  }
  if (ageCalendarDays <= SHORT_FLOAT_AGING_MAX_CALENDAR_DAYS) {
    return { freshnessState: "AGING", ageCalendarDays, futureDated: false };
  }
  return { freshnessState: "STALE", ageCalendarDays, futureDated: false };
}

function resolveUsable(input: {
  shortFloatPct: number | null;
  qualityState: ShortFloatQualityState;
  freshnessState: ShortFloatFreshnessState;
  staleUsable: boolean;
  agingUsable: boolean;
  unknownFreshnessUsable: boolean;
}): boolean {
  if (input.shortFloatPct === null) return false;
  if (input.qualityState === "INVALID" || input.qualityState === "UNAVAILABLE") return false;
  if (input.qualityState === "DISCREPANCY") return false;
  if (input.freshnessState === "STALE") return input.staleUsable;
  if (input.freshnessState === "AGING") return input.agingUsable;
  if (input.freshnessState === "UNKNOWN") return input.unknownFreshnessUsable;
  return input.qualityState === "VALID";
}

export function normalizeShortFloat(
  input: ShortFloatInput,
  options?: ShortFloatNormalizeOptions,
): ShortFloatNormalization {
  const diagnostics: ShortFloatDiagnostic[] = [];
  const tolerance = isPositiveFinite(options?.discrepancyTolerancePct)
    ? options.discrepancyTolerancePct
    : SHORT_FLOAT_DISCREPANCY_TOLERANCE_PCT;
  const clockSkewMs = isFiniteNumber(options?.futureClockSkewMs) && options.futureClockSkewMs >= 0
    ? options.futureClockSkewMs
    : SHORT_FLOAT_FUTURE_CLOCK_SKEW_MS;
  const staleUsable = options?.staleUsableForScoring ?? SHORT_FLOAT_STALE_USABLE_FOR_SCORING;
  const agingUsable = options?.agingUsableForScoring ?? SHORT_FLOAT_AGING_USABLE_FOR_SCORING;
  const unknownFreshnessUsable =
    options?.unknownFreshnessUsableForScoring ?? SHORT_FLOAT_UNKNOWN_FRESHNESS_USABLE_FOR_SCORING;

  const symbol =
    typeof input.symbol === "string" && input.symbol.trim() !== ""
      ? input.symbol.trim().toUpperCase()
      : null;

  const provider = parseNonNegative(input.shortFloatPct);
  const shortInterest = parseNonNegative(input.shortInterestShares);
  const floatShares = parsePositive(input.floatShares);
  const sharesOutstanding = parsePositive(input.sharesOutstanding);
  const daysToCover = parseNonNegative(input.daysToCover);
  const sourceAsOf = toCanonicalUtc(input.sourceAsOf);
  const fetchedAt = toCanonicalUtc(input.fetchedAt);

  if (provider.invalid) {
    diagnostics.push(diagnostic("INVALID_NUMBER", "shortFloatPct is not a finite number >= 0.", "shortFloatPct"));
  }
  if (shortInterest.invalid) {
    diagnostics.push(
      diagnostic("INVALID_NUMBER", "shortInterestShares is not a finite number >= 0.", "shortInterestShares"),
    );
  }
  if (floatShares.invalid) {
    diagnostics.push(diagnostic("INVALID_FLOAT", "floatShares must be a finite number > 0.", "floatShares"));
  }
  if (input.sharesOutstanding !== undefined && input.sharesOutstanding !== null && sharesOutstanding.invalid) {
    diagnostics.push(
      diagnostic("INVALID_NUMBER", "sharesOutstanding is not a finite number > 0.", "sharesOutstanding"),
    );
  }
  if (daysToCover.invalid) {
    diagnostics.push(diagnostic("INVALID_NUMBER", "daysToCover is not a finite number >= 0.", "daysToCover"));
  }
  if (sourceAsOf.invalid) {
    diagnostics.push(diagnostic("INVALID_TIMESTAMP", "sourceAsOf is not a valid timestamp.", "sourceAsOf"));
  }
  if (fetchedAt.invalid) {
    diagnostics.push(diagnostic("INVALID_TIMESTAMP", "fetchedAt is not a valid timestamp.", "fetchedAt"));
  }

  let derivedShortFloatPct: number | null = null;
  if (shortInterest.value !== null && floatShares.value !== null) {
    derivedShortFloatPct = deriveShortFloatPct(shortInterest.value, floatShares.value);
    if (derivedShortFloatPct === null) {
      diagnostics.push(diagnostic("INVALID_DERIVATION", "Derived short float is not a finite number >= 0."));
    }
  } else if (shortInterest.value !== null && !floatShares.provided) {
    diagnostics.push(
      diagnostic("MISSING_FLOAT", "floatShares is required to derive shortFloatPct.", "floatShares"),
    );
  }

  if (
    sharesOutstanding.value !== null &&
    floatShares.value === null &&
    shortInterest.value !== null
  ) {
    diagnostics.push(
      diagnostic(
        "FLOAT_NOT_SUBSTITUTED",
        "sharesOutstanding is not a substitute for floatShares.",
        "sharesOutstanding",
      ),
    );
  }

  const providerShortFloatPct = provider.value;
  let shortFloatPct: number | null = null;
  let valueSource: ShortFloatValueSource | null = null;
  let discrepancy: ShortFloatDiscrepancy | null = null;
  let qualityState: ShortFloatQualityState = "UNAVAILABLE";

  if (providerShortFloatPct !== null && derivedShortFloatPct !== null) {
    const absoluteDifferencePct = Math.abs(providerShortFloatPct - derivedShortFloatPct);
    if (absoluteDifferencePct <= tolerance) {
      shortFloatPct = providerShortFloatPct;
      valueSource = "PROVIDER";
      qualityState = "VALID";
    } else {
      discrepancy = {
        providerShortFloatPct,
        derivedShortFloatPct,
        absoluteDifferencePct,
        tolerancePct: tolerance,
      };
      qualityState = "DISCREPANCY";
      diagnostics.push(
        diagnostic(
          "DISCREPANCY",
          "Provider and derived shortFloatPct differ by more than the configured tolerance.",
        ),
      );
    }
  } else if (providerShortFloatPct !== null) {
    shortFloatPct = providerShortFloatPct;
    valueSource = "PROVIDER";
    qualityState = "VALID";
  } else if (derivedShortFloatPct !== null) {
    shortFloatPct = derivedShortFloatPct;
    valueSource = "DERIVED";
    qualityState = "VALID";
  } else if (provider.invalid || shortInterest.invalid || floatShares.invalid) {
    qualityState = "INVALID";
  } else if (
    shortInterest.value !== null ||
    floatShares.value !== null ||
    daysToCover.value !== null ||
    sharesOutstanding.value !== null
  ) {
    qualityState = "PARTIAL";
  }

  const evaluatedAtMs = parseEvaluatedAtMs(options?.evaluatedAt);
  const sourceAsOfMs = sourceAsOf.iso ? parseTimestampMs(sourceAsOf.iso) : null;
  const freshness = resolveFreshness(sourceAsOfMs, evaluatedAtMs, clockSkewMs);

  if (sourceAsOf.invalid || freshness.futureDated) {
    qualityState = "INVALID";
    if (freshness.futureDated) {
      diagnostics.push(
        diagnostic("FUTURE_SOURCE_AS_OF", "sourceAsOf is beyond the allowed clock-skew tolerance.", "sourceAsOf"),
      );
    }
  }

  const usableForScoring = resolveUsable({
    shortFloatPct,
    qualityState,
    freshnessState: freshness.freshnessState,
    staleUsable,
    agingUsable,
    unknownFreshnessUsable,
  });

  const source =
    typeof input.source === "string" && input.source.trim() !== "" ? input.source.trim() : null;

  return {
    version: SHORT_FLOAT_MODEL_VERSION,
    symbol,
    shortFloatPct,
    shortInterestShares: shortInterest.value,
    floatShares: floatShares.value,
    sharesOutstanding: sharesOutstanding.value,
    daysToCover: daysToCover.value,
    providerShortFloatPct,
    derivedShortFloatPct,
    valueSource,
    discrepancy,
    source,
    sourceAsOf: sourceAsOf.iso,
    fetchedAt: fetchedAt.iso,
    freshnessState: freshness.freshnessState,
    freshnessBasis: SHORT_FLOAT_FRESHNESS_BASIS,
    ageCalendarDays: freshness.ageCalendarDays,
    qualityState,
    usableForScoring,
    diagnostics,
  };
}

export function toShortFloatConsumerView(result: ShortFloatNormalization): ShortFloatConsumerView {
  return {
    version: result.version,
    shortFloatPct: result.shortFloatPct,
    freshnessState: result.freshnessState,
    qualityState: result.qualityState,
    sourceAsOf: result.sourceAsOf,
    usableForScoring: result.usableForScoring,
  };
}
