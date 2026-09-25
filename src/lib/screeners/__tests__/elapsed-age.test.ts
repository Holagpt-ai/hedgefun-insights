import { describe, expect, it } from "vitest";
import { formatTriggerTimeDisplay } from "@/lib/screeners/screener-trigger-time";
import { formatElapsedAge } from "@/lib/screeners/elapsed-age";

const EVENT = "2026-09-25T22:01:22.000Z";
const NOW = Date.parse("2026-09-25T22:38:34.000Z");

describe("scanner trigger clock", () => {
  it("renders military evening time as 12-hour PM and morning time as AM", () => {
    expect(formatTriggerTimeDisplay("2026-09-25T22:38:34.000Z")).toBe("6:38:34 PM");
    expect(formatTriggerTimeDisplay("2026-09-25T13:38:34.000Z")).toBe("9:38:34 AM");
  });

  it("derives elapsed age from the stored event and the supplied clock", () => {
    expect(formatElapsedAge(EVENT, NOW)).toBe("37m 12s ago");
    expect(formatElapsedAge(EVENT, NOW + 1000)).toBe("37m 13s ago");
    expect(formatElapsedAge(EVENT, NOW + 2000)).toBe("37m 14s ago");
    expect(formatElapsedAge(EVENT, Date.parse(EVENT) + 14_000)).toBe("14s ago");
    expect(formatElapsedAge(EVENT, Date.parse(EVENT) + (8 * 60 + 27) * 1000)).toBe("8m 27s ago");
    expect(formatElapsedAge(EVENT, Date.parse(EVENT) + (1 * 3600 + 17 * 60 + 8) * 1000)).toBe("1h 17m 08s ago");
    expect(formatElapsedAge(null, NOW)).toBeNull();
    expect(formatElapsedAge("not-a-time", NOW)).toBeNull();
  });
});
