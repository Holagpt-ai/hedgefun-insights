import { describe, expect, it } from "vitest";
import { sessionOpeningGapPct } from "@/lib/behavior-profile/session-opening-gap";
import type { SecurityDailyHistory } from "@/types/security-intelligence";

function daily(partial: Partial<SecurityDailyHistory>): SecurityDailyHistory {
  return {
    securityId: "11111111-1111-1111-1111-111111111111",
    sessionDate: "2024-01-02",
    observedSymbol: "AAA",
    exchange: null,
    open: 10,
    high: 11,
    low: 9.5,
    close: 10.5,
    volume: 1_000_000,
    dollarVolume: null,
    previousClose: 9,
    movePct: null,
    source: null,
    sourceAsOf: null,
    fetchedAt: null,
    computedAt: null,
    quality: "AUTHORITATIVE",
    freshness: "FRESH",
    provenance: "TEST",
    ...partial,
  };
}

describe("sessionOpeningGapPct", () => {
  it("computes gap from open vs previous close", () => {
    expect(sessionOpeningGapPct(daily({ open: 10, previousClose: 8 }))).toBeCloseTo(25, 5);
  });

  it("returns null when prior close missing", () => {
    expect(sessionOpeningGapPct(daily({ previousClose: null }))).toBeNull();
  });
});
