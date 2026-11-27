import { describe, expect, it } from "vitest";
import {
  briefCacheScopeKey,
  briefSnapshotSupersededBySchedule,
} from "@/lib/ai/brief-card-request-lifecycle";

describe("brief card request lifecycle", () => {
  it("builds a stable scope key for user and brief type", () => {
    expect(briefCacheScopeKey({ userId: "user-a", briefType: "am" })).toBe("user-a:am");
    expect(briefCacheScopeKey({ userId: "user-a", briefType: "pm" })).toBe("user-a:pm");
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
});