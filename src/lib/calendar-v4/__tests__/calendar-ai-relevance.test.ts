import { describe, expect, it } from "vitest";
import { isCachedAnalysisRelevantForCalendarDay } from "@/lib/calendar-v4/calendar-ai-relevance";

describe("calendar cached analysis relevance", () => {
  it("rejects stale analysis for far-future selected dates", () => {
    expect(
      isCachedAnalysisRelevantForCalendarDay(
        "2026-12-01",
        new Date().toISOString(),
      ),
    ).toBe(false);
  });
});