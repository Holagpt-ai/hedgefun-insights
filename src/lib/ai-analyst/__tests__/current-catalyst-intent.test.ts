import { describe, expect, it } from "vitest";
import {
  classifyCurrentCatalystIntent,
  extractTickerFromCatalystQuestion,
  resolveAnalystSymbolForQuestion,
} from "@/lib/ai-analyst/current-catalyst-intent";

describe("current catalyst intent", () => {
  it("detects MRVL morning question", () => {
    expect(classifyCurrentCatalystIntent("MRVL? Why is it up this morning").isCurrentCatalyst).toBe(true);
  });

  it("extracts ticker from leading symbol prompt", () => {
    expect(extractTickerFromCatalystQuestion("MRVL? Why is it up this morning")).toBe("MRVL");
  });

  it("prefers active symbol over question when both exist", () => {
    expect(
      resolveAnalystSymbolForQuestion({
        activeSymbol: "NVDA",
        userQuestion: "Why is MRVL up today?",
      }),
    ).toBe("NVDA");
  });

  it("falls back to ticker embedded in question", () => {
    expect(
      resolveAnalystSymbolForQuestion({
        activeSymbol: null,
        userQuestion: "Why is MRVL up today?",
      }),
    ).toBe("MRVL");
  });

  it("does not treat ordinary market wording as a ticker", () => {
    expect(extractTickerFromCatalystQuestion("Why is the market down today?")).toBeNull();
    expect(extractTickerFromCatalystQuestion("Why is it moving?")).toBeNull();
    expect(extractTickerFromCatalystQuestion("What caused the selloff?")).toBeNull();
  });

  it("keeps explicit short tickers and symbol handoffs", () => {
    expect(extractTickerFromCatalystQuestion("Why is F up today?")).toBe("F");
    expect(extractTickerFromCatalystQuestion("IT? Why is it moving?")).toBe("IT");
    expect(extractTickerFromCatalystQuestion("What is moving with $IT")).toBe("IT");
    expect(
      resolveAnalystSymbolForQuestion({
        activeSymbol: "IT",
        userQuestion: "Why is it moving?",
      }),
    ).toBe("IT");
  });
});
