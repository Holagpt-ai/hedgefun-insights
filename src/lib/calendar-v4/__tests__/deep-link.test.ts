import { describe, expect, it } from "vitest";
import { buildCalendarV4Href } from "@/lib/calendar-v4/deep-link";

describe("calendar v4 deep link", () => {
  it("builds /calendar handoff with tab and filter", () => {
    expect(buildCalendarV4Href({ isoDate: "2026-11-26", tab: "catalyst" })).toBe(
      "/calendar?calDate=2026-11-26&calTab=catalyst&calFilter=all",
    );
    expect(buildCalendarV4Href({ isoDate: "2026-11-26", tab: "economic" })).toBe(
      "/calendar?calDate=2026-11-26&calTab=economic&calFilter=macro",
    );
  });
});