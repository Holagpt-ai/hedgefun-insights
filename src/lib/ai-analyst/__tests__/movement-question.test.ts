import { describe, expect, it } from "vitest";
import { isMovementCatalystQuestion } from "@/lib/ai-analyst/movement-question";

describe("isMovementCatalystQuestion", () => {
  it("matches why-is-it-up prompts", () => {
    expect(isMovementCatalystQuestion("Why is MRVL up today?")).toBe(true);
    expect(isMovementCatalystQuestion("MRVL? Why is it up this morning")).toBe(true);
    expect(isMovementCatalystQuestion("Why is this stock moving this morning?")).toBe(true);
    expect(isMovementCatalystQuestion("What is the catalyst for NVDA today?")).toBe(true);
    expect(isMovementCatalystQuestion("Why did XYZ spike today?")).toBe(true);
    expect(isMovementCatalystQuestion("What's moving TSLA premarket?")).toBe(true);
  });

  it("rejects generic analysis prompts", () => {
    expect(isMovementCatalystQuestion("Analyze AAPL as a day-trade setup")).toBe(false);
    expect(isMovementCatalystQuestion("What is RVOL?")).toBe(false);
  });
});
