import { describe, expect, it } from "vitest";
import { calendarCatalystQueryRange } from "@/lib/calendar-v4/calendar-range";

describe("calendarCatalystQueryRange", () => {
  it("expands range when week crosses into adjacent month", () => {
    const r = calendarCatalystQueryRange(2026, 11, "2026-11-28");
    expect(r.from <= "2026-11-01").toBe(true);
    expect(r.to >= "2026-12-02").toBe(true);
  });
});