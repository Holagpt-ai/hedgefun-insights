import { describe, expect, it } from "vitest";
import {
  shouldPreserveBriefOnRefreshFailure,
  staleRefreshNotice,
  type CachedBriefSnapshot,
} from "@/lib/ai/brief-refresh-state";

const SAMPLE: CachedBriefSnapshot = {
  content: "Brief body",
  generatedAtEt: "Sep 30, 08:00 AM",
  previousTradingDay: false,
  briefDateDisplay: "Sep 30, 2026",
  evidenceCutoff: "2026-09-30T12:00:00.000Z",
  freshnessState: "current",
  generationWindow: "early",
  expectedGenerationWindow: "mid",
  supersededBy: null,
  ageSeconds: 120,
  generationReason: "material_change",
};

describe("brief refresh preservation", () => {
  it("keeps the last good brief when refresh fails with 200 unavailable", () => {
    expect(shouldPreserveBriefOnRefreshFailure(SAMPLE, 200, false)).toBe(true);
  });

  it("does not preserve on auth failures", () => {
    expect(shouldPreserveBriefOnRefreshFailure(SAMPLE, 401, false)).toBe(false);
  });

  it("formats stale refresh notice with timestamp", () => {
    expect(staleRefreshNotice("Sep 30, 08:00 AM")).toContain("Sep 30, 08:00 AM");
    expect(staleRefreshNotice("Sep 30, 08:00 AM")).toContain("refresh did not complete");
  });
});
