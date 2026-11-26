import { describe, expect, it } from "vitest";
import {
  resolveCatalystCalendarStatus,
  resolveEconomicCalendarStatus,
} from "@/lib/calendar-v4/calendar-event-status";
import type { CatalystEvent } from "@/types/catalyst";
import type { EconomicCalendarRow } from "@/lib/calendar-v4/economic-types";

const catalyst = (over: Partial<CatalystEvent>): CatalystEvent =>
  ({
    id: "1",
    symbol: "AAA",
    event_type: "news",
    verification_state: "provider_reported",
    event_date: "2020-01-01",
    title: "t",
    source_name: "wire",
    provider: "polygon",
    facts: {},
    ...over,
  }) as CatalystEvent;

describe("calendar event status", () => {
  it("uses earnings disposition for reported", () => {
    expect(
      resolveCatalystCalendarStatus(
        catalyst({ facts: { earnings_disposition: "results_reported" } }),
      ),
    ).toBe("reported");
  });

  it("uses cancelled fact", () => {
    expect(resolveCatalystCalendarStatus(catalyst({ facts: { status: "cancelled" } }))).toBe("cancelled");
  });

  it("economic scheduled without actual", () => {
    const row = {
      id: "1",
      event_name: "CPI",
      event_date: "2026-12-01",
      actual_value: null,
      actual_reported_at: null,
    } as EconomicCalendarRow;
    expect(resolveEconomicCalendarStatus(row, "2026-11-26")).toBe("scheduled");
  });

  it("economic reported with actual only", () => {
    const row = {
      id: "1",
      event_name: "CPI",
      event_date: "2026-11-01",
      actual_value: "0.2",
      actual_reported_at: null,
    } as EconomicCalendarRow;
    expect(resolveEconomicCalendarStatus(row, "2026-11-26")).toBe("reported");
  });
});