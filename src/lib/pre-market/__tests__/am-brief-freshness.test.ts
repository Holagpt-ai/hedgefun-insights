import { describe, expect, it } from "vitest";
import {
  classifyBriefGenerationWindow,
  expectedGenerationWindow,
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
