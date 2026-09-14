import { describe, expect, it } from "vitest";
import {
  activeSupersessionTarget,
  classifyBriefGenerationWindow,
  expectedGenerationWindow,
  inferLegacyGenerationWindow,
  isInsideFinalPreopenRecoveryEnvelope,
  isInsideGenerationWindow,
  resolveAmBriefFreshness,
  shouldRegenerateForWindowSupersession,
} from "@/lib/pre-market/am-brief-freshness";

const BRIEF_DATE = "2026-09-14";

describe("AM brief generation windows", () => {
  it("classifies early session at approximately 4:20 AM ET as current", () => {
    const now = new Date("2026-09-14T08:20:00.000Z"); // 4:20 AM ET
    const generatedAt = "2026-09-14T08:15:00.000Z"; // 4:15 AM ET
    expect(isInsideGenerationWindow(4 * 60 + 20)).toBe("early");
    expect(expectedGenerationWindow(4 * 60 + 20)).toBe("early");
    expect(classifyBriefGenerationWindow(generatedAt)).toBe("early");
    const freshness = resolveAmBriefFreshness({
      now,
      briefDate: BRIEF_DATE,
      generatedAt,
    });
    expect(freshness.freshnessState).toBe("current");
    expect(freshness.generationWindow).toBe("early");
  });

  it("mid-session brief supersedes early brief at approximately 7:30 AM ET", () => {
    const now = new Date("2026-09-14T11:30:00.000Z"); // 7:30 AM ET
    const earlyGeneratedAt = "2026-09-14T08:15:00.000Z";
    const midGeneratedAt = "2026-09-14T11:05:00.000Z"; // 7:05 AM ET

    const earlyFreshness = resolveAmBriefFreshness({
      now,
      briefDate: BRIEF_DATE,
      generatedAt: earlyGeneratedAt,
    });
    expect(earlyFreshness.freshnessState).toBe("stale");
    expect(earlyFreshness.supersededBy).toBe("mid");

    const midFreshness = resolveAmBriefFreshness({
      now,
      briefDate: BRIEF_DATE,
      generatedAt: midGeneratedAt,
      snapshotGenerationWindow: "mid",
    });
    expect(midFreshness.freshnessState).toBe("current");
    expect(midFreshness.generationWindow).toBe("mid");
  });

  it("missing mid-session generation marks early brief stale at approximately 7:30 AM ET", () => {
    const now = new Date("2026-09-14T11:30:00.000Z");
    const freshness = resolveAmBriefFreshness({
      now,
      briefDate: BRIEF_DATE,
      generatedAt: "2026-09-14T08:15:00.000Z",
      snapshotGenerationWindow: "early",
    });
    expect(freshness.freshnessState).toBe("stale");
    expect(freshness.expectedGenerationWindow).toBe("mid");
    expect(freshness.supersededBy).toBe("mid");
  });

  it("final pre-open brief supersedes earlier generations at approximately 8:45 AM ET", () => {
    const now = new Date("2026-09-14T12:45:00.000Z"); // 8:45 AM ET
    const finalGeneratedAt = "2026-09-14T12:40:00.000Z"; // 8:40 AM ET

    const earlyOnly = resolveAmBriefFreshness({
      now,
      briefDate: BRIEF_DATE,
      generatedAt: "2026-09-14T08:15:00.000Z",
      snapshotGenerationWindow: "early",
    });
    expect(earlyOnly.freshnessState).toBe("stale");
    expect(earlyOnly.supersededBy).toBe("final_preopen");

    const finalFreshness = resolveAmBriefFreshness({
      now,
      briefDate: BRIEF_DATE,
      generatedAt: finalGeneratedAt,
      snapshotGenerationWindow: "final_preopen",
    });
    expect(finalFreshness.freshnessState).toBe("current");
    expect(finalFreshness.generationWindow).toBe("final_preopen");
  });

  it("previous-day brief is expired for the current trading day", () => {
    const now = new Date("2026-09-14T12:45:00.000Z");
    const freshness = resolveAmBriefFreshness({
      now,
      briefDate: "2026-09-12",
      generatedAt: "2026-09-12T12:40:00.000Z",
      snapshotGenerationWindow: "final_preopen",
    });
    expect(freshness.isCurrentEtTradingDay).toBe(false);
    expect(freshness.freshnessState).toBe("expired");
  });

  it("after-hours marks the AM brief expired at noon ET", () => {
    const now = new Date("2026-09-14T17:00:00.000Z"); // 1:00 PM ET
    const freshness = resolveAmBriefFreshness({
      now,
      briefDate: BRIEF_DATE,
      generatedAt: "2026-09-14T12:40:00.000Z",
      snapshotGenerationWindow: "final_preopen",
    });
    expect(freshness.freshnessState).toBe("expired");
  });
});

describe("AM brief window supersession gate", () => {
  it("does not regenerate when still inside the same generation window without material change path", () => {
    expect(
      shouldRegenerateForWindowSupersession({
        nowMinutesEt: 7 * 60 + 15,
        existingGeneratedAt: "2026-09-14T11:05:00.000Z",
        existingSnapshot: { generation_window: "mid" },
      }),
    ).toBe(false);
  });

  it("regenerates when cron enters a later generation window", () => {
    expect(
      shouldRegenerateForWindowSupersession({
        nowMinutesEt: 7 * 60 + 15,
        existingGeneratedAt: "2026-09-14T08:15:00.000Z",
        existingSnapshot: { generation_window: "early" },
      }),
    ).toBe(true);
    expect(
      shouldRegenerateForWindowSupersession({
        nowMinutesEt: 8 * 60 + 40,
        existingGeneratedAt: "2026-09-14T11:05:00.000Z",
        existingSnapshot: { generation_window: "mid" },
      }),
    ).toBe(true);
  });

  it("does not regenerate outside controlled generation windows", () => {
    expect(
      shouldRegenerateForWindowSupersession({
        nowMinutesEt: 6 * 60 + 30,
        existingGeneratedAt: "2026-09-14T08:15:00.000Z",
        existingSnapshot: { generation_window: "early" },
      }),
    ).toBe(false);
  });
});

describe("Final pre-open recovery envelope", () => {
  it("keeps final pre-open expected at 8:30 while nominal window ends at 8:50", () => {
    expect(expectedGenerationWindow(8 * 60 + 30)).toBe("final_preopen");
    expect(isInsideGenerationWindow(8 * 60 + 50)).toBe("final_preopen");
    expect(isInsideGenerationWindow(8 * 60 + 51)).toBeNull();
    expect(isInsideFinalPreopenRecoveryEnvelope(8 * 60 + 51)).toBe(true);
  });

  it("allows recovery supersession after 8:50 when final generation is missing", () => {
    expect(activeSupersessionTarget(9 * 60)).toBe("final_preopen");
    expect(
      shouldRegenerateForWindowSupersession({
        nowMinutesEt: 9 * 60,
        existingGeneratedAt: "2026-09-14T11:05:00.000Z",
        existingSnapshot: { generation_window: "mid" },
      }),
    ).toBe(true);
    expect(
      shouldRegenerateForWindowSupersession({
        nowMinutesEt: 9 * 60 + 15,
        existingGeneratedAt: "2026-09-14T08:15:00.000Z",
        existingSnapshot: { generation_window: "early" },
      }),
    ).toBe(true);
  });

  it("does not regenerate an existing final brief solely because recovery time remains", () => {
    expect(
      shouldRegenerateForWindowSupersession({
        nowMinutesEt: 9 * 60,
        existingGeneratedAt: "2026-09-14T12:40:00.000Z",
        existingSnapshot: { generation_window: "final_preopen" },
      }),
    ).toBe(false);
    expect(
      shouldRegenerateForWindowSupersession({
        nowMinutesEt: 9 * 60 + 20,
        existingGeneratedAt: "2026-09-14T12:40:00.000Z",
        existingSnapshot: { generation_window: "final_preopen" },
      }),
    ).toBe(false);
  });

  it("closes recovery after approximately 9:25 AM ET", () => {
    expect(activeSupersessionTarget(9 * 60 + 25)).toBe("final_preopen");
    expect(activeSupersessionTarget(9 * 60 + 26)).toBeNull();
  });
});

describe("Legacy brief compatibility", () => {
  it("infers generation window from generated_at when snapshot metadata is absent", () => {
    expect(inferLegacyGenerationWindow("2026-09-14T08:15:00.000Z")).toBe("early");
    expect(inferLegacyGenerationWindow("2026-09-14T09:30:00.000Z")).toBe("early"); // 5:30 AM ET
    expect(inferLegacyGenerationWindow("2026-09-14T11:05:00.000Z")).toBe("mid");
    expect(inferLegacyGenerationWindow("2026-09-14T12:10:00.000Z")).toBe("mid");
    expect(inferLegacyGenerationWindow("2026-09-14T12:40:00.000Z")).toBe("final_preopen");
  });

  it("does not mark a usable same-day legacy brief unavailable", () => {
    const freshness = resolveAmBriefFreshness({
      now: new Date("2026-09-14T12:45:00.000Z"),
      briefDate: BRIEF_DATE,
      generatedAt: "2026-09-14T08:15:00.000Z",
    });
    expect(freshness.generationWindow).toBe("early");
    expect(freshness.freshnessState).toBe("stale");
    expect(freshness.freshnessState).not.toBe("unavailable");
  });
});
