import { describe, it, expect } from "vitest";
import {
  extractPolygonSnapshotFields,
  formatQuoteRejectionLog,
  humanizeFailureCode,
  USER_SNAPSHOT_UNAVAILABLE,
  validateQuote,
} from "@/lib/quotes/integrity";
import { buildAiEvidence, isInsufficientEvidence } from "@/lib/ai/evidence";

const TS = "2026-08-27T12:00:00.000Z";

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    symbol: "AAPL",
    price: 189.42,
    changePct: 1.25,
    volume: 12_000_000,
    quoteTimestamp: TS,
    lastTradePrice: 189.42,
    minuteClose: 189.4,
    dayClose: 189.5,
    vwap: 188.9,
    priorClose: 187.1,
    currency: "USD",
    ...overrides,
  };
}

describe("quote integrity", () => {
  it("accepts a valid normal quote", () => {
    const q = validateQuote(validInput());
    expect(q.valid).toBe(true);
    expect(q.price).toBe(189.42);
    expect(q.change_pct).toBe(1.25);
    expect(q.volume).toBe(12_000_000);
    expect(q.rejection_reason).toBeNull();
  });

  it("accepts a legitimate high-priced stock without a max-price cap", () => {
    const q = validateQuote(validInput({
      symbol: "BRK.A",
      price: 712_345.5,
      lastTradePrice: 712_345.5,
      minuteClose: 712_100,
      dayClose: 711_900,
      vwap: 710_000,
      priorClose: 705_000,
    }));
    expect(q.valid).toBe(true);
    expect(q.price).toBe(712_345.5);
  });

  it("treats a missing quote as an honest missing state", () => {
    const q = validateQuote({ symbol: "MSFT" });
    expect(q.valid).toBe(false);
    expect(q.rejection_reason).toBe("MISSING_QUOTE");
    expect(humanizeFailureCode(q.rejection_reason)).toBe("Market snapshot unavailable.");
  });

  it("rejects a malformed number", () => {
    const q = validateQuote(validInput({ price: "not-a-price" }));
    expect(q.valid).toBe(false);
    expect(q.rejection_reason).toBe("MALFORMED_PRICE");
    expect(humanizeFailureCode("MALFORMED_PRICE")).toBe(USER_SNAPSHOT_UNAVAILABLE);
  });

  it("detects a decimal-scale mismatch when corroborating fields exist", () => {
    const q = validateQuote(validInput({
      symbol: "EXAMPLE",
      price: 977,
      lastTradePrice: 97.7,
      dayClose: 977,
      minuteClose: 97.65,
    }));
    expect(q.valid).toBe(false);
    expect(q.rejection_reason).toBe("DECIMAL_SCALE_MISMATCH");
    expect(q.price).toBeNull();
    expect(formatQuoteRejectionLog(q)).toContain("symbol=EXAMPLE");
    expect(formatQuoteRejectionLog(q)).toContain("reason=DECIMAL_SCALE_MISMATCH");
    expect(formatQuoteRejectionLog(q)).not.toMatch(/apiKey|Bearer|token=/i);
  });

  it("detects an adjusted/unadjusted mismatch when metadata exists", () => {
    const q = validateQuote(validInput({
      adjustedClose: 156.65,
      unadjustedClose: 1566.5,
    }));
    expect(q.valid).toBe(false);
    expect(q.rejection_reason).toBe("SPLIT_ADJUSTMENT_MISMATCH");
  });

  it("does not reject a large genuine session move without scale evidence", () => {
    const q = validateQuote(validInput({
      price: 12,
      lastTradePrice: 12,
      minuteClose: 11.8,
      dayClose: 12,
      vwap: 10.5,
      priorClose: 8,
      changePct: 50,
    }));
    expect(q.valid).toBe(true);
  });

  it("rejects a non-USD currency when provider metadata is present", () => {
    const q = validateQuote(validInput({ currency: "EUR" }));
    expect(q.valid).toBe(false);
    expect(q.rejection_reason).toBe("CURRENCY_MISMATCH");
  });

  it("extracts Polygon snapshot fields without inventing values", () => {
    const fields = extractPolygonSnapshotFields({
      ticker: {
        ticker: "MU",
        day: { c: 97.7, v: 1_000_000, vw: 97.1 },
        prevDay: { c: 96.2 },
        lastTrade: { p: 97.7, t: Date.parse(TS) },
        min: { c: 97.65 },
      },
    });
    expect(fields?.symbol).toBe("MU");
    expect(fields?.lastTradePrice).toBe(97.7);
    expect(fields?.dayClose).toBe(97.7);
  });

  it("excludes an invalid quote from AI evidence inputs", () => {
    const quote = validateQuote(validInput({
      price: 1566.54,
      lastTradePrice: 156.65,
      dayClose: 1566.54,
    }));
    const evidence = buildAiEvidence({
      symbol: "SNDK",
      quote,
      evidenceCutoff: TS,
    });
    expect(quote.valid).toBe(false);
    expect(evidence.quote_valid).toBe(false);
    expect(evidence.price).toBeNull();
    expect(isInsufficientEvidence(evidence)).toBe(true);
  });

  it("never exposes SNAPSHOT_MISSING as production copy", () => {
    expect(humanizeFailureCode("SNAPSHOT_MISSING")).toBe("Market snapshot unavailable.");
    expect(humanizeFailureCode("SNAPSHOT_MISSING")).not.toContain("SNAPSHOT_MISSING");
    expect(humanizeFailureCode("QUOTE_REJECTED")).toBe(USER_SNAPSHOT_UNAVAILABLE);
  });
});
