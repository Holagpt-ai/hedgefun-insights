import { describe, expect, it } from "vitest";
import {
  briefCacheScopeKey,
  briefFetchStillValid,
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

  it("detects when live schedule expects a newer AM generation window", () => {
    const midSession = new Date("2026-11-27T12:45:00.000Z");
    expect(
      briefSnapshotSupersededBySchedule({
        briefType: "am",
        generationWindow: "early",
        now: midSession,
      }),
    ).toBe(true);
    expect(
      briefSnapshotSupersededBySchedule({
        briefType: "am",
        generationWindow: "mid",
        now: midSession,
      }),
    ).toBe(false);
    expect(
      briefSnapshotSupersededBySchedule({
        briefType: "pm",
        generationWindow: "early",
        now: midSession,
      }),
    ).toBe(false);
  });

  it("rejects stale fetch when account or generation changed", () => {
    expect(
      briefFetchStillValid({
        generation: 2,
        activeGeneration: 3,
        capturedUserId: "a",
        capturedBriefType: "am",
        liveUserId: "a",
        liveBriefType: "am",
        sessionUserId: "a",
      }),
    ).toBe(false);
    expect(
      briefFetchStillValid({
        generation: 2,
        activeGeneration: 2,
        capturedUserId: "a",
        capturedBriefType: "am",
        liveUserId: "b",
        liveBriefType: "am",
        sessionUserId: "a",
      }),
    ).toBe(false);
  });
});