import { describe, expect, it } from "vitest";
import {
  FLOAT_STALE_TIME_MS,
  isFloatObservationFresh,
  verifiedFreeFloatFromRecord,
  verifiedFloatRecordForDisplay,
} from "@/lib/market-data/float";

const NOW = Date.parse("2026-09-21T14:00:00.000Z");
const FRESH_AS_OF = "2026-09-21T08:00:00.000Z";
const STALE_AS_OF = "2026-01-01T00:00:00.000Z";

describe("free float observation freshness", () => {
  it("rejects missing or invalid asOf", () => {
    const base = {
      ticker: "AAA",
      float: 1_000_000,
      source: "massive_float" as const,
      status: "ok" as const,
    };
    expect(isFloatObservationFresh({ ...base, asOf: null }, NOW)).toBe(false);
    expect(isFloatObservationFresh({ ...base, asOf: "not-a-date" }, NOW)).toBe(false);
    expect(verifiedFreeFloatFromRecord({ ...base, asOf: null }, NOW)).toBeNull();
  });

  it("accepts a recent float observation within TTL", () => {
    const record = {
      ticker: "AAA",
      float: 2_400_000,
      asOf: FRESH_AS_OF,
      source: "massive_float" as const,
      status: "ok" as const,
    };
    expect(isFloatObservationFresh(record, NOW, FLOAT_STALE_TIME_MS)).toBe(true);
    expect(verifiedFreeFloatFromRecord(record, NOW)).toBe(2_400_000);
  });

  it("rejects expired float observation even when a new screener quote would be fresh", () => {
    const record = {
      ticker: "AAA",
      float: 2_400_000,
      asOf: STALE_AS_OF,
      source: "massive_float" as const,
      status: "ok" as const,
    };
    const screenerQuoteAsOf = "2026-09-21T14:00:00.000Z";
    expect(Date.parse(screenerQuoteAsOf)).toBeGreaterThan(Date.parse(STALE_AS_OF));
    expect(isFloatObservationFresh(record, NOW)).toBe(false);
    expect(verifiedFreeFloatFromRecord(record, NOW)).toBeNull();
    expect(verifiedFloatRecordForDisplay(record, NOW).status).toBe("unavailable");
  });
});
