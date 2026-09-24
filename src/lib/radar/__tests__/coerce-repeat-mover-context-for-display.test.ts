import { describe, expect, it } from "vitest";
import { coerceRepeatMoverContextForDisplay } from "@/lib/radar/coerce-repeat-mover-context-for-display";

describe("coerceRepeatMoverContextForDisplay", () => {
  it("returns null for non-objects and payloads without profile", () => {
    expect(coerceRepeatMoverContextForDisplay(null)).toBeNull();
    expect(coerceRepeatMoverContextForDisplay({ securityId: "x" })).toBeNull();
  });

  it("normalizes partial bridge payloads with safe comparableHistory defaults", () => {
    const coerced = coerceRepeatMoverContextForDisplay({
      securityId: "sec-1",
      profile: { profileAvailable: true, episodeCount: 3 },
      comparableHistory: { comparableEpisodeCount: "2" },
    });
    expect(coerced?.securityId).toBe("sec-1");
    expect(coerced?.comparableHistory.comparableEpisodeCount).toBe(2);
    expect(coerced?.evidenceLabels).toEqual([]);
  });

  it("drops payloads that cannot identify security", () => {
    expect(
      coerceRepeatMoverContextForDisplay({
        profile: { profileAvailable: true },
      }),
    ).toBeNull();
  });
});
