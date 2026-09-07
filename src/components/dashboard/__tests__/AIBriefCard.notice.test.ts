import { describe, expect, it } from "vitest";
import { resolveAmBriefNoticeAt } from "@/components/dashboard/AIBriefCard";

describe("resolveAmBriefNoticeAt", () => {
  it("returns holiday closed guidance for Labor Day", () => {
    const out = resolveAmBriefNoticeAt(new Date("2026-09-07T14:00:00Z")); // 10:00 AM ET
    expect(out.message).toContain("Labor Day");
    expect(out.message).toContain("markets are closed today");
    expect(out.message).toContain("Tuesday, September 8");
    expect(out.refreshable).toBe(false);
    expect(out.showAfterHoursCta).toBe(false);
  });

  it("returns weekend guidance on Saturday", () => {
    const out = resolveAmBriefNoticeAt(new Date("2026-08-01T16:00:00Z")); // Sat noon ET
    expect(out.message).toContain("U.S. markets are closed today.");
    expect(out.message).toContain("Monday, August 3");
    expect(out.refreshable).toBe(false);
    expect(out.showAfterHoursCta).toBe(false);
  });

  it("skips Monday holiday when evaluating Sunday before Labor Day", () => {
    const out = resolveAmBriefNoticeAt(new Date("2026-09-06T16:00:00Z")); // Sun noon ET
    expect(out.message).toContain("Tuesday, September 8");
    expect(out.refreshable).toBe(false);
  });

  it("returns normal weekday morning not-ready guidance", () => {
    const out = resolveAmBriefNoticeAt(new Date("2026-08-03T11:00:00Z")); // 7:00 AM ET
    expect(out.message).toBe("Today's AI Pre-Market Brief is being prepared. Check again shortly.");
    expect(out.refreshable).toBe(true);
  });

  it("returns noon expiry handoff guidance at 12:30 PM ET", () => {
    const out = resolveAmBriefNoticeAt(new Date("2026-08-03T16:30:00Z"));
    expect(out.message).toContain("The AM Brief has expired.");
    expect(out.message).toContain("After-Hours workflow begins at 3:00 PM ET.");
    expect(out.showAfterHoursCta).toBe(true);
    expect(out.refreshable).toBe(false);
  });

  it("returns active after-hours guidance at 3:30 PM ET", () => {
    const out = resolveAmBriefNoticeAt(new Date("2026-08-03T19:30:00Z"));
    expect(out.message).toContain("The After-Hours workflow is now active.");
    expect(out.message).toContain("PM Brief will publish after the market closes.");
    expect(out.showAfterHoursCta).toBe(true);
    expect(out.refreshable).toBe(false);
  });
});
