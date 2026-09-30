import { describe, expect, it } from "vitest";
import {
  emptyLastGoodBriefCache,
  getCachedBrief,
  setCachedBrief,
  shouldPreserveBriefOnRefreshFailure,
  staleRefreshNotice,
  type CachedBriefSnapshot,
} from "@/lib/ai/brief-refresh-state";

const AM: CachedBriefSnapshot = {
  content: "AM body",
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

const PM: CachedBriefSnapshot = {
  ...AM,
  content: "PM body",
  generatedAtEt: "Sep 30, 04:30 PM",
};

describe("brief refresh preservation", () => {
  it("keeps the last good brief when refresh fails with 200 unavailable", () => {
    expect(shouldPreserveBriefOnRefreshFailure(AM, 200, false, "am", "am")).toBe(true);
  });

  it("does not preserve on auth failures", () => {
    expect(shouldPreserveBriefOnRefreshFailure(AM, 401, false, "am", "am")).toBe(false);
  });

  it("formats stale refresh notice with timestamp", () => {
    expect(staleRefreshNotice("Sep 30, 08:00 AM")).toContain("refresh did not complete");
  });

  it("scopes AM and PM caches independently", () => {
    const cache = emptyLastGoodBriefCache();
    setCachedBrief(cache, "am", AM);
    setCachedBrief(cache, "pm", PM);
    expect(getCachedBrief(cache, "am")?.content).toBe("AM body");
    expect(getCachedBrief(cache, "pm")?.content).toBe("PM body");
  });

  it("does not preserve AM content when PM refresh fails", () => {
    const cache = emptyLastGoodBriefCache();
    setCachedBrief(cache, "am", AM);
    const priorPm = getCachedBrief(cache, "pm");
    expect(shouldPreserveBriefOnRefreshFailure(priorPm, 200, false, "pm", "pm")).toBe(false);
    expect(shouldPreserveBriefOnRefreshFailure(AM, 200, false, "pm", "am")).toBe(false);
  });

  it("does not preserve PM content when AM refresh fails", () => {
    const cache = emptyLastGoodBriefCache();
    setCachedBrief(cache, "pm", PM);
    expect(shouldPreserveBriefOnRefreshFailure(PM, 200, false, "am", "pm")).toBe(false);
  });
});
