import { describe, expect, it } from "vitest";
import { getMarketStatus } from "@/components/home/GlobalMarketClocks";

const NEW_YORK = {
  city: "New York",
  exchange: "NYSE · NASDAQ",
  timezone: "America/New_York",
  openHour: 9,
  openMinute: 30,
  closeHour: 16,
  closeMinute: 0,
  preMarketStart: 4,
  afterHoursEnd: 20,
  url: "https://www.nyse.com",
};

describe("GlobalMarketClocks New York status", () => {
  it("shows CLOSED on Labor Day 2026 at 1:30 PM ET", () => {
    const now = new Date("2026-09-07T17:30:00Z");
    expect(getMarketStatus(NEW_YORK, now)).toBe("closed");
  });

  it("shows OPEN on a normal Monday at 10:00 AM ET", () => {
    const now = new Date("2026-08-03T14:00:00Z");
    expect(getMarketStatus(NEW_YORK, now)).toBe("open");
  });

  it("shows CLOSED on weekends", () => {
    const sat = new Date("2026-08-01T16:00:00Z");
    const sun = new Date("2026-08-02T16:00:00Z");
    expect(getMarketStatus(NEW_YORK, sat)).toBe("closed");
    expect(getMarketStatus(NEW_YORK, sun)).toBe("closed");
  });
});
