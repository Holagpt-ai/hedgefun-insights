import { describe, expect, it } from "vitest";
import {
  briefCacheScopeKey,
  briefSnapshotSupersededBySchedule,
  lastGoodBriefUsable,
  shouldReleaseBriefInFlightGuard,
} from "@/lib/ai/brief-card-request-lifecycle";

describe("brief card request lifecycle", () => {
  it("scopes in-memory last-good brief to user and brief type", () => {
    const key = briefCacheScopeKey({ userId: "user-a", briefType: "am" });
    expect(lastGoodBriefUsable({ userId: "user-a", briefType: "am" }, key)).toBe(true);
    expect(lastGoodBriefUsable({ userId: "user-b", briefType: "am" }, key)).toBe(false);
    expect(lastGoodBriefUsable({ userId: "user-a", briefType: "pm" }, key)).toBe(false);
  });

  it("only releases in-flight ownership for the active generation", () => {
    expect(shouldReleaseBriefInFlightGuard(3, 3)).toBe(true);
    expect(shouldReleaseBriefInFlightGuard(4, 3)).toBe(false);
  });

  it("detects when schedule expects a newer AM generation window", () => {
    expect(
      briefSnapshotSupersededBySchedule({
        briefType: "am",
        generationWindow: "early",
        expectedGenerationWindow: "mid",
      }),
    ).toBe(true);
    expect(
      briefSnapshotSupersededBySchedule({
        briefType: "am",
        generationWindow: "mid",
        expectedGenerationWindow: "mid",
      }),
    ).toBe(false);
    expect(
      briefSnapshotSupersededBySchedule({
        briefType: "pm",
        generationWindow: "early",
        expectedGenerationWindow: "final_preopen",
      }),
    ).toBe(false);
  });
});