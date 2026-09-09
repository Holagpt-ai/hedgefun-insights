import { describe, expect, it } from "vitest";
import { INDEX_DISPLAY_LABELS, indexDisplayLabel } from "@/lib/market-indexes/display-labels";

describe("macro strip instrument labels", () => {
  it("maps provider ETF symbols to truthful ETF labels, not spot/yield names", () => {
    expect(indexDisplayLabel("GLD", "Gold")).toBe("Gold ETF");
    expect(indexDisplayLabel("TLT", "20Y Treasury")).toBe("20Y Treasury ETF");
    expect(indexDisplayLabel("VIXY", "VIX")).toBe("VIX ETF");
    expect(indexDisplayLabel("SLV", "Silver")).toBe("Silver ETF");
    expect(indexDisplayLabel("IBIT", "Bitcoin")).toBe("Bitcoin ETF");
    expect(indexDisplayLabel("BNO", "Brent Crude")).toBe("Brent Crude ETF");
    expect(indexDisplayLabel("UNG", "Nat Gas")).toBe("Nat Gas ETF");
    expect(indexDisplayLabel("UUP", "US Dollar")).toBe("US Dollar ETF");
    expect(indexDisplayLabel("SPY", "S&P 500")).toBe("S&P 500 ETF");
    expect(indexDisplayLabel("QQQ", "Nasdaq 100")).toBe("Nasdaq 100 ETF");
    expect(indexDisplayLabel("DIA", "Dow Jones")).toBe("Dow Jones ETF");
    expect(indexDisplayLabel("IWM", "Russell 2000")).toBe("Russell 2000 ETF");
  });

  it("does not invent a label for an unknown symbol", () => {
    expect(indexDisplayLabel("FAKE", "Stored Name")).toBe("Stored Name");
    expect(indexDisplayLabel("FAKE", null)).toBe("FAKE");
    expect(INDEX_DISPLAY_LABELS.FAKE).toBeUndefined();
  });
});
