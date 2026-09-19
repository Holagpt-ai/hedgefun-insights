import { describe, expect, it } from "vitest";
import {
  SHORT_FLOAT_AGING_MAX_CALENDAR_DAYS,
  SHORT_FLOAT_DISCREPANCY_TOLERANCE_PCT,
  SHORT_FLOAT_FRESH_MAX_CALENDAR_DAYS,
  SHORT_FLOAT_FUTURE_CLOCK_SKEW_MS,
  SHORT_FLOAT_MODEL_VERSION,
  SHORT_FLOAT_MS_PER_CALENDAR_DAY,
} from "@/config/short-float.config";
import { normalizeShortFloat, toShortFloatConsumerView } from "@/lib/screeners/short-float";
import type { ShortFloatInput } from "@/types/short-float";

const EVALUATED_AT = "2026-09-18T16:00:00.000Z";

function daysBefore(days: number): string {
  return new Date(Date.parse(EVALUATED_AT) - days * SHORT_FLOAT_MS_PER_CALENDAR_DAY).toISOString();
}

function input(overrides: ShortFloatInput = {}): ShortFloatInput {
  return { symbol: "AAPL", ...overrides };
}

describe("Short Float V1 — canonical values", () => {
  it("1. accepts a valid provider shortFloatPct", () => {
    const result = normalizeShortFloat(input({ shortFloatPct: 18.4 }));
    expect(result.shortFloatPct).toBe(18.4);
    expect(result.qualityState).toBe("VALID");
  });

  it("2. derives shortFloatPct from short interest and float", () => {
    const result = normalizeShortFloat(
      input({ shortInterestShares: 4_600_000, floatShares: 25_000_000 }),
    );
    expect(result.shortFloatPct).toBe(18.4);
    expect(result.derivedShortFloatPct).toBe(18.4);
  });

  it("3. zero short interest produces a valid 0%", () => {
    const result = normalizeShortFloat(
      input({ shortInterestShares: 0, floatShares: 25_000_000 }),
    );
    expect(result.shortFloatPct).toBe(0);
    expect(result.qualityState).toBe("VALID");
  });

  it("4. missing float prevents derivation", () => {
    const result = normalizeShortFloat(input({ shortInterestShares: 4_600_000 }));
    expect(result.shortFloatPct).toBeNull();
    expect(result.derivedShortFloatPct).toBeNull();
    expect(result.qualityState).toBe("PARTIAL");
  });

  it("5. zero float is invalid", () => {
    const result = normalizeShortFloat(input({ shortInterestShares: 1_000, floatShares: 0 }));
    expect(result.shortFloatPct).toBeNull();
    expect(result.qualityState).toBe("INVALID");
  });

  it("6. negative float is invalid", () => {
    const result = normalizeShortFloat(input({ shortInterestShares: 1_000, floatShares: -10 }));
    expect(result.shortFloatPct).toBeNull();
    expect(result.qualityState).toBe("INVALID");
  });

  it("7. negative short interest is invalid", () => {
    const result = normalizeShortFloat(input({ shortInterestShares: -1, floatShares: 25_000_000 }));
    expect(result.shortFloatPct).toBeNull();
    expect(result.qualityState).toBe("INVALID");
  });

  it("8. NaN is rejected", () => {
    const result = normalizeShortFloat(input({ shortFloatPct: Number.NaN }));
    expect(result.shortFloatPct).toBeNull();
    expect(result.qualityState).toBe("INVALID");
  });

  it("9. Infinity is rejected", () => {
    const result = normalizeShortFloat(input({ shortFloatPct: Number.POSITIVE_INFINITY }));
    expect(result.shortFloatPct).toBeNull();
    expect(result.qualityState).toBe("INVALID");
  });
});

describe("Short Float V1 — provenance and discrepancy", () => {
  it("10. provider value provenance is PROVIDER", () => {
    const result = normalizeShortFloat(input({ shortFloatPct: 18.4 }));
    expect(result.valueSource).toBe("PROVIDER");
    expect(result.providerShortFloatPct).toBe(18.4);
  });

  it("11. derived value provenance is DERIVED", () => {
    const result = normalizeShortFloat(
      input({ shortInterestShares: 4_600_000, floatShares: 25_000_000 }),
    );
    expect(result.valueSource).toBe("DERIVED");
  });

  it("12. provider and derived agreement keeps the provider value", () => {
    const result = normalizeShortFloat(
      input({
        shortFloatPct: 18.4,
        shortInterestShares: 4_600_000,
        floatShares: 25_000_000,
      }),
    );
    expect(result.qualityState).toBe("VALID");
    expect(result.valueSource).toBe("PROVIDER");
    expect(result.discrepancy).toBeNull();
    expect(result.shortFloatPct).toBe(18.4);
  });

  it("13. provider and derived disagreement is flagged, not overwritten", () => {
    const result = normalizeShortFloat(
      input({
        shortFloatPct: 18.4,
        shortInterestShares: 10_000_000,
        floatShares: 25_000_000,
      }),
    );
    expect(result.qualityState).toBe("DISCREPANCY");
    expect(result.shortFloatPct).toBeNull();
    expect(result.discrepancy).toMatchObject({
      providerShortFloatPct: 18.4,
      derivedShortFloatPct: 40,
    });
    expect(result.discrepancy?.absoluteDifferencePct).toBeGreaterThan(
      SHORT_FLOAT_DISCREPANCY_TOLERANCE_PCT,
    );
  });

  it("14. discrepancy tolerance is configurable", () => {
    const payload = input({
      shortFloatPct: 10,
      shortInterestShares: 3_250_000,
      floatShares: 25_000_000,
    });
    const strict = normalizeShortFloat(payload);
    const relaxed = normalizeShortFloat(payload, { discrepancyTolerancePct: 3 });
    expect(strict.qualityState).toBe("DISCREPANCY");
    expect(relaxed.qualityState).toBe("VALID");
    expect(relaxed.shortFloatPct).toBe(10);
  });
});

describe("Short Float V1 — freshness and timestamps", () => {
  it("15. valid sourceAsOf is canonicalized to UTC", () => {
    const result = normalizeShortFloat(
      input({ shortFloatPct: 12, sourceAsOf: "2026-09-10T14:30:00.000Z" }),
    );
    expect(result.sourceAsOf).toBe("2026-09-10T14:30:00.000Z");
  });

  it("16. Fresh state", () => {
    const result = normalizeShortFloat(
      input({
        shortFloatPct: 12,
        sourceAsOf: daysBefore(SHORT_FLOAT_FRESH_MAX_CALENDAR_DAYS),
      }),
      { evaluatedAt: EVALUATED_AT },
    );
    expect(result.freshnessState).toBe("FRESH");
    expect(result.ageCalendarDays).toBe(SHORT_FLOAT_FRESH_MAX_CALENDAR_DAYS);
  });

  it("17. Aging state", () => {
    const result = normalizeShortFloat(
      input({
        shortFloatPct: 12,
        sourceAsOf: daysBefore(SHORT_FLOAT_FRESH_MAX_CALENDAR_DAYS + 1),
      }),
      { evaluatedAt: EVALUATED_AT },
    );
    expect(result.freshnessState).toBe("AGING");
  });

  it("18. Stale state", () => {
    const result = normalizeShortFloat(
      input({
        shortFloatPct: 12,
        sourceAsOf: daysBefore(SHORT_FLOAT_AGING_MAX_CALENDAR_DAYS + 1),
      }),
      { evaluatedAt: EVALUATED_AT },
    );
    expect(result.freshnessState).toBe("STALE");
  });

  it("19. missing sourceAsOf is UNKNOWN freshness", () => {
    const result = normalizeShortFloat(input({ shortFloatPct: 12 }), { evaluatedAt: EVALUATED_AT });
    expect(result.freshnessState).toBe("UNKNOWN");
  });

  it("20. fetchedAt is distinct from sourceAsOf", () => {
    const result = normalizeShortFloat(
      input({
        shortFloatPct: 12,
        sourceAsOf: "2026-09-01T00:00:00.000Z",
        fetchedAt: "2026-09-18T15:00:00.000Z",
      }),
      { evaluatedAt: EVALUATED_AT },
    );
    expect(result.sourceAsOf).toBe("2026-09-01T00:00:00.000Z");
    expect(result.fetchedAt).toBe("2026-09-18T15:00:00.000Z");
    expect(result.sourceAsOf).not.toBe(result.fetchedAt);
  });
});

describe("Short Float V1 — missing data and quality", () => {
  it("21. unknown short float remains null", () => {
    const result = normalizeShortFloat(input({}));
    expect(result.shortFloatPct).toBeNull();
  });

  it("22. valid 0 remains zero", () => {
    const result = normalizeShortFloat(input({ shortFloatPct: 0 }));
    expect(result.shortFloatPct).toBe(0);
    expect(result.shortFloatPct).not.toBeNull();
  });

  it("23. invalid provider value does not become zero", () => {
    const result = normalizeShortFloat(input({ shortFloatPct: Number.NaN }));
    expect(result.shortFloatPct).toBeNull();
    expect(result.shortFloatPct).not.toBe(0);
  });

  it("24. VALID quality state", () => {
    expect(normalizeShortFloat(input({ shortFloatPct: 8 })).qualityState).toBe("VALID");
  });

  it("25. PARTIAL quality state", () => {
    expect(normalizeShortFloat(input({ daysToCover: 2.5 })).qualityState).toBe("PARTIAL");
  });

  it("26. DISCREPANCY quality state", () => {
    const result = normalizeShortFloat(
      input({ shortFloatPct: 5, shortInterestShares: 10_000_000, floatShares: 20_000_000 }),
    );
    expect(result.qualityState).toBe("DISCREPANCY");
  });

  it("27. UNAVAILABLE quality state", () => {
    expect(normalizeShortFloat(input({})).qualityState).toBe("UNAVAILABLE");
  });

  it("28. INVALID quality state", () => {
    expect(normalizeShortFloat(input({ floatShares: 0 })).qualityState).toBe("INVALID");
  });
});

describe("Short Float V1 — scoring usability and contract", () => {
  it("29. stale data is not usable for scoring by default", () => {
    const result = normalizeShortFloat(
      input({
        shortFloatPct: 12,
        sourceAsOf: daysBefore(SHORT_FLOAT_AGING_MAX_CALENDAR_DAYS + 5),
      }),
      { evaluatedAt: EVALUATED_AT },
    );
    expect(result.freshnessState).toBe("STALE");
    expect(result.usableForScoring).toBe(false);
    expect(toShortFloatConsumerView(result).usableForScoring).toBe(false);
  });

  it("30. fresh valid data is usable for scoring", () => {
    const result = normalizeShortFloat(
      input({ shortFloatPct: 12, sourceAsOf: daysBefore(2) }),
      { evaluatedAt: EVALUATED_AT },
    );
    expect(result.freshnessState).toBe("FRESH");
    expect(result.qualityState).toBe("VALID");
    expect(result.usableForScoring).toBe(true);
  });

  it("31. aging usability follows config / options", () => {
    const payload = input({
      shortFloatPct: 12,
      sourceAsOf: daysBefore(SHORT_FLOAT_FRESH_MAX_CALENDAR_DAYS + 2),
    });
    const defaultAging = normalizeShortFloat(payload, { evaluatedAt: EVALUATED_AT });
    const disabled = normalizeShortFloat(payload, {
      evaluatedAt: EVALUATED_AT,
      agingUsableForScoring: false,
    });
    expect(defaultAging.freshnessState).toBe("AGING");
    expect(defaultAging.usableForScoring).toBe(true);
    expect(disabled.usableForScoring).toBe(false);
  });

  it("32. repeated normalization is deterministic", () => {
    const payload = input({
      shortFloatPct: 18.4,
      shortInterestShares: 4_600_000,
      floatShares: 25_000_000,
      sourceAsOf: daysBefore(3),
      fetchedAt: EVALUATED_AT,
    });
    const options = { evaluatedAt: EVALUATED_AT };
    expect(normalizeShortFloat(payload, options)).toEqual(normalizeShortFloat(payload, options));
  });

  it("33. does not mutate input", () => {
    const payload = input({ shortFloatPct: 12, floatShares: 25_000_000 });
    const snapshot = structuredClone(payload);
    normalizeShortFloat(payload, { evaluatedAt: EVALUATED_AT });
    expect(payload).toEqual(snapshot);
  });

  it("34. output version is v1", () => {
    const result = normalizeShortFloat(input({ shortFloatPct: 1 }));
    expect(result.version).toBe("v1");
    expect(result.version).toBe(SHORT_FLOAT_MODEL_VERSION);
    expect(toShortFloatConsumerView(result).version).toBe("v1");
  });

  it("35. source is provider-neutral metadata", () => {
    const result = normalizeShortFloat(input({ shortFloatPct: 9, source: "fundamentals-feed" }));
    expect(result.source).toBe("fundamentals-feed");
  });

  it("36. does not require provider-specific fields", () => {
    const result = normalizeShortFloat({
      shortInterestShares: 1_000_000,
      floatShares: 10_000_000,
    });
    expect(result.shortFloatPct).toBe(10);
    expect(result.valueSource).toBe("DERIVED");
  });

  it("37. daysToCover remains a separate field", () => {
    const result = normalizeShortFloat(
      input({ shortFloatPct: 15, daysToCover: 3.25 }),
    );
    expect(result.daysToCover).toBe(3.25);
    expect(result.shortFloatPct).toBe(15);
    expect(result.shortFloatPct).not.toBe(result.daysToCover);
  });

  it("38. sharesOutstanding is not substituted for float", () => {
    const result = normalizeShortFloat(
      input({ shortInterestShares: 5_000_000, sharesOutstanding: 50_000_000 }),
    );
    expect(result.shortFloatPct).toBeNull();
    expect(result.derivedShortFloatPct).toBeNull();
    expect(result.sharesOutstanding).toBe(50_000_000);
    expect(result.diagnostics.some((item) => item.code === "FLOAT_NOT_SUBSTITUTED")).toBe(true);
  });

  it("39. malformed timestamps are rejected", () => {
    const result = normalizeShortFloat(
      input({ shortFloatPct: 12, sourceAsOf: "not-a-date" }),
      { evaluatedAt: EVALUATED_AT },
    );
    expect(result.sourceAsOf).toBeNull();
    expect(result.qualityState).toBe("INVALID");
    expect(result.usableForScoring).toBe(false);
  });

  it("40. future sourceAsOf beyond clock skew is INVALID", () => {
    const future = new Date(
      Date.parse(EVALUATED_AT) + SHORT_FLOAT_FUTURE_CLOCK_SKEW_MS + 60_000,
    ).toISOString();
    const withinSkew = new Date(Date.parse(EVALUATED_AT) + 60_000).toISOString();
    const rejected = normalizeShortFloat(
      input({ shortFloatPct: 12, sourceAsOf: future }),
      { evaluatedAt: EVALUATED_AT },
    );
    const accepted = normalizeShortFloat(
      input({ shortFloatPct: 12, sourceAsOf: withinSkew }),
      { evaluatedAt: EVALUATED_AT },
    );
    expect(rejected.qualityState).toBe("INVALID");
    expect(rejected.usableForScoring).toBe(false);
    expect(accepted.qualityState).toBe("VALID");
    expect(accepted.freshnessState).toBe("FRESH");
  });
});
