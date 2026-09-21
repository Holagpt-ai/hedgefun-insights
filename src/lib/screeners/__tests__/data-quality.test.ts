import { describe, expect, it } from "vitest";
import {
  DATA_QUALITY_CONTRACT_VERSION,
  DATA_QUALITY_DIAGNOSTIC_CODES,
} from "@/config/data-quality.config";
import {
  combineFreshness,
  createAuthoritativeValue,
  createDerivedValue,
  createDiscrepancyValue,
  createInvalidValue,
  createPartialValue,
  createUnavailableValue,
  deriveFromInputs,
  deriveQualityState,
  getMetricPolicy,
  isUsableForDisplay,
  isUsableForFiltering,
  isUsableForScoring,
  validateNumericMetric,
} from "@/lib/screeners/data-quality";

const AS_OF = "2026-09-10T14:30:00.000Z";
const OBSERVED = "2026-09-18T15:00:00.000Z";
const FETCHED = "2026-09-18T15:01:00.000Z";
const COMPUTED = "2026-09-18T15:01:05.000Z";

describe("Data Quality contract V1", () => {
  it("1. authoritative fresh value", () => {
    const value = createAuthoritativeValue(12.5, { metric: "price", freshnessState: "FRESH" });
    expect(value.qualityState).toBe("AUTHORITATIVE");
    expect(value.freshnessState).toBe("FRESH");
    expect(value.value).toBe(12.5);
    expect(value.usableForScoring).toBe(true);
  });

  it("2. derived fresh value", () => {
    const value = createDerivedValue(25_000_000, { metric: "dollarVolume", freshnessState: "FRESH" });
    expect(value.qualityState).toBe("DERIVED");
    expect(value.provenance).toBe("DERIVED");
    expect(value.usableForScoring).toBe(true);
  });

  it("3. valid zero remains zero", () => {
    const value = createAuthoritativeValue(0, { metric: "volume" });
    expect(value.value).toBe(0);
    expect(value.qualityState).toBe("AUTHORITATIVE");
  });

  it("4. unavailable null", () => {
    const value = createUnavailableValue({ metric: "rvol20d" });
    expect(value.value).toBeNull();
    expect(value.qualityState).toBe("UNAVAILABLE");
  });

  it("5. NaN is invalid", () => {
    const value = createAuthoritativeValue(Number.NaN, { metric: "volume" });
    expect(value.qualityState).toBe("INVALID");
    expect(value.value).toBeNull();
  });

  it("6. Infinity is invalid", () => {
    const value = createAuthoritativeValue(Number.POSITIVE_INFINITY, { metric: "volume" });
    expect(value.qualityState).toBe("INVALID");
    expect(value.value).toBeNull();
  });

  it("7. negative is invalid for a positive-only metric", () => {
    const value = createAuthoritativeValue(-1, { metric: "volume" });
    expect(value.qualityState).toBe("INVALID");
    expect(validateNumericMetric(-1, "volume").ok).toBe(false);
  });

  it("8. negative is allowed for signed move", () => {
    const value = createAuthoritativeValue(-8.4, { metric: "movePct" });
    expect(value.qualityState).toBe("AUTHORITATIVE");
    expect(value.value).toBe(-8.4);
  });

  it("9. fresh", () => {
    expect(createAuthoritativeValue(1, { freshnessState: "FRESH" }).freshnessState).toBe("FRESH");
  });

  it("10. aging", () => {
    expect(createAuthoritativeValue(1, { freshnessState: "AGING", metric: "volume" }).freshnessState).toBe(
      "AGING",
    );
  });

  it("11. stale", () => {
    const value = createAuthoritativeValue(19.2, { freshnessState: "STALE", metric: "shortFloatPct" });
    expect(value.freshnessState).toBe("STALE");
    expect(value.diagnostics.some((item) => item.code === "STALE_DATA")).toBe(true);
  });

  it("12. unknown freshness", () => {
    expect(createAuthoritativeValue(1, { freshnessState: "UNKNOWN" }).freshnessState).toBe("UNKNOWN");
  });

  it("13. stale display is allowed by default", () => {
    const value = createAuthoritativeValue(19.2, { freshnessState: "STALE", metric: "shortFloatPct" });
    expect(isUsableForDisplay(value)).toBe(true);
  });

  it("14. stale scoring is blocked by default", () => {
    const value = createAuthoritativeValue(19.2, { freshnessState: "STALE", metric: "shortFloatPct" });
    expect(isUsableForScoring(value)).toBe(false);
  });

  it("15. stale filtering is blocked by default", () => {
    const value = createAuthoritativeValue(19.2, { freshnessState: "STALE", metric: "shortFloatPct" });
    expect(isUsableForFiltering(value)).toBe(false);
  });

  it("16. aging default scoring is allowed", () => {
    const value = createAuthoritativeValue(19.2, { freshnessState: "AGING", metric: "shortFloatPct" });
    expect(isUsableForScoring(value)).toBe(true);
    expect(isUsableForFiltering(value)).toBe(true);
  });

  it("17. authoritative provenance", () => {
    expect(createAuthoritativeValue(10, { metric: "price" }).provenance).toBe("PROVIDER");
  });

  it("18. derived provenance", () => {
    expect(createDerivedValue(10, { metric: "dollarVolume" }).provenance).toBe("DERIVED");
  });

  it("19. internal provenance", () => {
    const value = createAuthoritativeValue("AAPL", { provenance: "INTERNAL" });
    expect(value.provenance).toBe("INTERNAL");
  });

  it("20. unknown provenance", () => {
    expect(createUnavailableValue().provenance).toBe("UNKNOWN");
  });

  it("21. sourceAsOf is preserved", () => {
    expect(createAuthoritativeValue(10, { metric: "price", sourceAsOf: AS_OF }).sourceAsOf).toBe(AS_OF);
  });

  it("22. observedAt is preserved", () => {
    expect(createAuthoritativeValue(10, { metric: "price", observedAt: OBSERVED }).observedAt).toBe(OBSERVED);
  });

  it("23. fetchedAt is preserved", () => {
    expect(createAuthoritativeValue(10, { metric: "price", fetchedAt: FETCHED }).fetchedAt).toBe(FETCHED);
  });

  it("24. computedAt is preserved", () => {
    expect(createDerivedValue(10, { metric: "dollarVolume", computedAt: COMPUTED }).computedAt).toBe(COMPUTED);
  });

  it("25. invalid timestamp diagnostic", () => {
    const value = createAuthoritativeValue(10, { metric: "price", sourceAsOf: "not-a-date" });
    expect(value.qualityState).toBe("INVALID");
    expect(value.diagnostics.some((item) => item.code === "INVALID_TIMESTAMP")).toBe(true);
  });

  it("26. future timestamp diagnostic", () => {
    const value = createAuthoritativeValue(10, {
      metric: "price",
      sourceAsOf: "2026-09-20T00:00:00.000Z",
      evaluatedAt: "2026-09-18T16:00:00.000Z",
    });
    expect(value.qualityState).toBe("INVALID");
    expect(value.diagnostics.some((item) => item.code === "FUTURE_TIMESTAMP")).toBe(true);
  });

  it("27. derived freshness from two fresh inputs", () => {
    const price = createAuthoritativeValue(10, { metric: "price", freshnessState: "FRESH" });
    const volume = createAuthoritativeValue(1_000_000, { metric: "volume", freshnessState: "FRESH" });
    const derived = deriveFromInputs(10_000_000, [price, volume], { metric: "dollarVolume" });
    expect(derived.qualityState).toBe("DERIVED");
    expect(derived.freshnessState).toBe("FRESH");
  });

  it("28. fresh + aging => aging", () => {
    expect(
      combineFreshness(["FRESH", "AGING"]),
    ).toBe("AGING");
  });

  it("29. fresh + stale => stale", () => {
    expect(combineFreshness(["FRESH", "STALE"])).toBe("STALE");
  });

  it("30. UNKNOWN freshness propagation", () => {
    expect(combineFreshness(["FRESH", "UNKNOWN"])).toBe("UNKNOWN");
  });

  it("31. derived value from unavailable input is blocked", () => {
    const price = createAuthoritativeValue(10, { metric: "price" });
    const volume = createUnavailableValue({ metric: "volume" });
    const derived = deriveFromInputs(null, [price, volume], { metric: "dollarVolume" });
    expect(derived.qualityState).toBe("PARTIAL");
    expect(isUsableForScoring(derived)).toBe(false);
  });

  it("32. derived value from invalid input is blocked", () => {
    const price = createAuthoritativeValue(10, { metric: "price" });
    const volume = createInvalidValue({ metric: "volume" });
    const derived = deriveFromInputs(10_000_000, [price, volume], { metric: "dollarVolume" });
    expect(derived.qualityState).toBe("INVALID");
    expect(derived.value).toBeNull();
  });

  it("33. derived value from discrepancy is blocked", () => {
    const left = createDiscrepancyValue(18.4, { metric: "shortFloatPct" });
    const derived = deriveFromInputs(18.4, [left], { metric: "shortFloatPct" });
    expect(derived.qualityState).toBe("DISCREPANCY");
    expect(isUsableForScoring(derived)).toBe(false);
  });

  it("34. dollar-volume policy permits valid zero", () => {
    expect(validateNumericMetric(0, "dollarVolume").ok).toBe(true);
    expect(createDerivedValue(0, { metric: "dollarVolume" }).value).toBe(0);
  });

  it("35. movePct permits negative", () => {
    expect(getMetricPolicy("movePct").allowsNegative).toBe(true);
    expect(validateNumericMetric(-12, "movePct").ok).toBe(true);
  });

  it("36. price rejects zero and nonpositive", () => {
    expect(validateNumericMetric(0, "price").ok).toBe(false);
    expect(createAuthoritativeValue(0, { metric: "price" }).qualityState).toBe("INVALID");
  });

  it("37. float rejects zero and nonpositive", () => {
    expect(validateNumericMetric(0, "float").ok).toBe(false);
    expect(createAuthoritativeValue(-1, { metric: "float" }).qualityState).toBe("INVALID");
  });

  it("38. discrepancy is display-usable", () => {
    const value = createDiscrepancyValue(18.4, { metric: "shortFloatPct" });
    expect(isUsableForDisplay(value)).toBe(true);
  });

  it("39. discrepancy is not score-usable", () => {
    expect(isUsableForScoring(createDiscrepancyValue(18.4, { metric: "shortFloatPct" }))).toBe(false);
  });

  it("40. discrepancy is not filter-usable", () => {
    expect(isUsableForFiltering(createDiscrepancyValue(18.4, { metric: "shortFloatPct" }))).toBe(false);
  });

  it("41. partial state", () => {
    const value = createPartialValue(null, { metric: "floatTurnover" });
    expect(value.qualityState).toBe("PARTIAL");
    expect(value.diagnostics.some((item) => item.code === "INSUFFICIENT_INPUTS")).toBe(true);
  });

  it("42. partial is not score-usable", () => {
    expect(isUsableForScoring(createPartialValue(1, { metric: "floatTurnover" }))).toBe(false);
  });

  it("43. unavailable does not expose a numeric display value", () => {
    const value = createUnavailableValue({ metric: "rvol20d" });
    expect(value.value).toBeNull();
    expect(value.usableForDisplay).toBe(false);
  });

  it("44. invalid does not expose a numeric display value", () => {
    const value = createInvalidValue({ metric: "rvol20d" });
    expect(value.value).toBeNull();
    expect(value.usableForDisplay).toBe(false);
  });

  it("45. metric policy can override stale scoring", () => {
    const value = createAuthoritativeValue(19.2, {
      metric: "shortFloatPct",
      freshnessState: "STALE",
      policyOverride: { staleScoringAllowed: true },
    });
    expect(isUsableForScoring(value)).toBe(true);
  });

  it("46. metric policy can override stale filtering", () => {
    const value = createAuthoritativeValue(19.2, {
      metric: "shortFloatPct",
      freshnessState: "STALE",
      policyOverride: { staleFilteringAllowed: true },
    });
    expect(isUsableForFiltering(value)).toBe(true);
  });

  it("47. repeated evaluation is deterministic", () => {
    const options = { metric: "price" as const, freshnessState: "FRESH" as const, sourceAsOf: AS_OF };
    expect(createAuthoritativeValue(10, options)).toEqual(createAuthoritativeValue(10, options));
    expect(deriveQualityState([])).toBe("UNAVAILABLE");
  });

  it("48. input options are not mutated", () => {
    const options = { metric: "price" as const, sourceAsOf: AS_OF, freshnessState: "FRESH" as const };
    const snapshot = structuredClone(options);
    createAuthoritativeValue(10, options);
    expect(options).toEqual(snapshot);
  });

  it("49. contract version is v1", () => {
    expect(DATA_QUALITY_CONTRACT_VERSION).toBe("v1");
    expect(createAuthoritativeValue(1, { metric: "volume" }).version).toBe("v1");
  });

  it("50. diagnostics are strongly typed", () => {
    const value = createUnavailableValue({ metric: "rvol20d" });
    for (const diagnostic of value.diagnostics) {
      expect(DATA_QUALITY_DIAGNOSTIC_CODES).toContain(diagnostic.code);
    }
  });
});
