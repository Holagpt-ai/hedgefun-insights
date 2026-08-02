import { describe, it, expect, afterEach, vi } from "vitest";
import { formatEarningsEventLabel } from "../EarningsCardsGrid";

afterEach(() => {
  vi.useRealTimers();
});

describe("formatEarningsEventLabel", () => {
  it("renders an absolute Monday label for 2026-08-03 when viewed on Sunday 2026-08-02", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T19:00:00Z"));
    expect(formatEarningsEventLabel("2026-08-03", "after_close")).toBe("Mon, Aug 3 · After close ET");
  });

  it("never emits relative wording", () => {
    const label = formatEarningsEventLabel("2026-08-02", "after_close");
    expect(label).not.toMatch(/today|tomorrow/i);
    expect(label).toBe("Sun, Aug 2 · After close ET");
  });

  it("labels the morning session without inventing a clock time", () => {
    expect(formatEarningsEventLabel("2026-08-03", "before_open")).toBe("Mon, Aug 3 · Before open ET");
    expect(formatEarningsEventLabel("2026-08-03", "during")).toBe("Mon, Aug 3 · During market hours ET");
  });

  it("does not shift the market calendar date across timezones", () => {
    // Date-only values must format identically regardless of local offset.
    expect(formatEarningsEventLabel("2026-01-01", "after_close")).toBe("Thu, Jan 1 · After close ET");
    expect(formatEarningsEventLabel("2026-12-31", "after_close")).toBe("Thu, Dec 31 · After close ET");
  });

  it("returns null for missing or invalid dates instead of guessing", () => {
    expect(formatEarningsEventLabel(null, "after_close")).toBeNull();
    expect(formatEarningsEventLabel(undefined, "after_close")).toBeNull();
    expect(formatEarningsEventLabel("", "after_close")).toBeNull();
    expect(formatEarningsEventLabel("not-a-date", "after_close")).toBeNull();
    expect(formatEarningsEventLabel("2026-02-30", "after_close")).toBeNull();
    expect(formatEarningsEventLabel("2026-13-01", "after_close")).toBeNull();
  });

  it("falls back to an honest session label when session is unknown", () => {
    expect(formatEarningsEventLabel("2026-08-03", null)).toBe("Mon, Aug 3 · Session TBD ET");
  });
});
