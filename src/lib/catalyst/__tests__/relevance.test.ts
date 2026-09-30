import { describe, expect, it } from "vitest";
import { classifyCatalystRelevance } from "@/lib/catalyst/relevance";

describe("catalyst relevance", () => {
  it("classifies direct issuer headlines", () => {
    const result = classifyCatalystRelevance({
      attribution: {
        title: "Micron Technology reports earnings beat",
        symbol: "MU",
        companyName: "Micron Technology",
        providerTickers: ["MU"],
      },
      eventType: "earnings",
    });
    expect(result.class).toBe("DIRECT");
    expect(result.tickerSpecific).toBe(true);
  });

  it("downgrades sector roundups", () => {
    const result = classifyCatalystRelevance({
      attribution: {
        title: "Semiconductor stocks to watch today",
        symbol: "MU",
        companyName: "Micron Technology",
        providerTickers: ["MU", "NVDA", "AMD", "INTC"],
      },
    });
    expect(["SECTOR", "MENTION"]).toContain(result.class);
    expect(result.tickerSpecific).toBe(false);
  });
});
