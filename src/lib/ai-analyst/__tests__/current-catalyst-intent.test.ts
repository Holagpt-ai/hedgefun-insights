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
});
