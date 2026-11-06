import { describe, expect, it } from "vitest";
import {
  mapFloatPayload,
  verifiedFreeFloatFromRecord,
  verifiedFloatRecordForDisplay,
  isFloatMeasurementDateUsable,
} from "@/lib/market-data/float";

const NOW = Date.parse("2026-09-21T14:00:00.000Z");
const OLD_MEASUREMENT = "2026-01-01T00:00:00.000Z";
const FUTURE_MEASUREMENT = "2027-01-01T00:00:00.000Z";

describe("Massive float measurement date contract", () => {
  it("maps free_float with effective_date from documented Massive response", () => {
    const mapped = mapFloatPayload("TEST", {
      results: [{ ticker: "TEST", free_float: 3_700_000, effective_date: "2026-09-23" }],
    });
    expect(mapped.float).toBe(3_700_000);
    expect(mapped.asOf).toBe("2026-09-23");
  });

  it("accepts older reference measurements for display (not intraday quote TTL)", () => {
    const record = {
      ticker: "AAA",
      float: 2_400_000,
      asOf: OLD_MEASUREMENT,
      source: "massive_float" as const,
      status: "ok" as const,
    };
    expect(isFloatMeasurementDateUsable(record, NOW)).toBe(true);
    expect(verifiedFreeFloatFromRecord(record, NOW)).toBe(2_400_000);
    expect(verifiedFloatRecordForDisplay(record, NOW).status).toBe("ok");
  });

  it("rejects missing, invalid, and future measurement dates", () => {
    const base = {
      ticker: "AAA",
      float: 1_000_000,
      source: "massive_float" as const,
      status: "ok" as const,
    };
    expect(verifiedFreeFloatFromRecord({ ...base, asOf: null }, NOW)).toBeNull();
    expect(verifiedFreeFloatFromRecord({ ...base, asOf: "not-a-date" }, NOW)).toBeNull();
    expect(isFloatMeasurementDateUsable({ ...base, asOf: FUTURE_MEASUREMENT }, NOW)).toBe(false);
    expect(verifiedFreeFloatFromRecord({ ...base, asOf: FUTURE_MEASUREMENT }, NOW)).toBeNull();
  });

  it("does not treat a fresh screener quote as float measurement proof", () => {
    const record = {
      ticker: "AAA",
      float: 2_400_000,
      asOf: OLD_MEASUREMENT,
      source: "massive_float" as const,
      status: "ok" as const,
    };
    const screenerQuoteAsOf = "2026-09-21T14:00:00.000Z";
    expect(Date.parse(screenerQuoteAsOf)).toBeGreaterThan(Date.parse(OLD_MEASUREMENT));
    expect(verifiedFreeFloatFromRecord(record, NOW)).toBe(2_400_000);
  });
});
