import { describe, expect, it } from "vitest";
import {
  EXTENDED_SESSION_BADGE_LABELS,
  getExtendedSessionBadgeState,
} from "@/lib/extended-session-badge";
import { getEtParts } from "@/lib/market-calendar";

const et = (iso: string) => new Date(iso);

describe("getExtendedSessionBadgeState", () => {
  it("1. 3:59 AM ET → no badge", () => {
    expect(getExtendedSessionBadgeState(et("2026-09-16T07:59:00Z"))).toBeNull();
  });

  it("2. 4:00 AM ET → PRE-MKT", () => {
    expect(getExtendedSessionBadgeState(et("2026-09-16T08:00:00Z"))).toBe("pre_market");
  });

  it("3. 9:29 AM ET → PRE-MKT", () => {
    expect(getExtendedSessionBadgeState(et("2026-09-16T13:29:00Z"))).toBe("pre_market");
  });

  it("4. 9:30 AM ET → no badge", () => {
    expect(getExtendedSessionBadgeState(et("2026-09-16T13:30:00Z"))).toBeNull();
  });

  it("5. 3:59 PM ET → no badge", () => {
    expect(getExtendedSessionBadgeState(et("2026-09-16T19:59:00Z"))).toBeNull();
  });

  it("6. 4:00 PM ET → AFTER-HRS", () => {
    expect(getExtendedSessionBadgeState(et("2026-09-16T20:00:00Z"))).toBe("after_hours");
  });

  it("7. 7:59 PM ET → AFTER-HRS", () => {
    expect(getExtendedSessionBadgeState(et("2026-09-16T23:59:00Z"))).toBe("after_hours");
  });

  it("8. 8:00 PM ET → no badge", () => {
    expect(getExtendedSessionBadgeState(et("2026-09-17T00:00:00Z"))).toBeNull();
  });

  it("9. weekend → no badge", () => {
    expect(getExtendedSessionBadgeState(et("2026-09-12T11:00:00Z"))).toBeNull(); // Sat 7:00 AM ET
    expect(getExtendedSessionBadgeState(et("2026-09-13T21:00:00Z"))).toBeNull(); // Sun 5:00 PM ET
  });

  it("10. holiday / closed session → no badge", () => {
    expect(getExtendedSessionBadgeState(et("2026-09-07T11:00:00Z"))).toBeNull(); // Labor Day 7:00 AM ET
    expect(getExtendedSessionBadgeState(et("2026-09-07T21:00:00Z"))).toBeNull(); // Labor Day 5:00 PM ET
  });

  it("11. timezone uses America/New_York rather than UTC wall clock", () => {
    const winterPremarket = et("2026-01-16T09:30:00Z"); // 4:30 AM EST
    expect(getEtParts(winterPremarket).hour).toBe(4);
    expect(winterPremarket.getUTCHours()).toBe(9);
    expect(getExtendedSessionBadgeState(winterPremarket)).toBe("pre_market");

    const summerAfterHours = et("2026-09-16T20:00:00Z"); // 4:00 PM EDT
    expect(getEtParts(summerAfterHours).hour).toBe(16);
    expect(summerAfterHours.getUTCHours()).toBe(20);
    expect(getExtendedSessionBadgeState(summerAfterHours)).toBe("after_hours");
  });

  it("15. badge labels are exactly PRE-MKT and AFTER-HRS", () => {
    expect(EXTENDED_SESSION_BADGE_LABELS.pre_market).toBe("PRE-MKT");
    expect(EXTENDED_SESSION_BADGE_LABELS.after_hours).toBe("AFTER-HRS");
    expect(EXTENDED_SESSION_BADGE_LABELS.pre_market).not.toBe("AM");
    expect(EXTENDED_SESSION_BADGE_LABELS.after_hours).not.toBe("PM");
  });
});
