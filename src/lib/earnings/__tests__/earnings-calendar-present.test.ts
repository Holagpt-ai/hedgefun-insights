import { describe, expect, it } from "vitest";
import {
  earningsTimeLabel,
  selectEarningsForView,
  type EarningsCalendarRow,
} from "@/lib/earnings/earnings-calendar-present";

const rows: EarningsCalendarRow[] = [
  {
    id: "1",
    symbol: "AAA",
    company_name: "A Co",
    report_date: "2026-11-24",
    time_of_day: "before_open",
    estimate_eps: 1,
  },
  {
    id: "2",
    symbol: "BBB",
    company_name: "B Co",
    report_date: "2026-11-25",
    time_of_day: "after_close",
    estimate_eps: 2,
  },
  {
    id: "3",
    symbol: "CCC",
    company_name: "C Co",
    report_date: "2026-11-25",
    time_of_day: null,
    estimate_eps: 3,
  },
];

describe("earnings calendar view selection", () => {
  it("daily mode returns only the selected date", () => {
    const daily = selectEarningsForView(rows, {
      viewMode: "Daily",
      selectedDateIso: "2026-11-25",
      timeFilter: "All",
      searchValue: "",
    });
    expect(daily.map((r) => r.symbol)).toEqual(["BBB", "CCC"]);
  });

  it("weekly mode returns the full week slice", () => {
    const weekly = selectEarningsForView(rows, {
      viewMode: "Weekly",
      selectedDateIso: "2026-11-25",
      timeFilter: "All",
      searchValue: "",
    });
    expect(weekly).toHaveLength(3);
  });

  it("weekly and daily differ when multiple days exist", () => {
    const daily = selectEarningsForView(rows, {
      viewMode: "Daily",
      selectedDateIso: "2026-11-24",
      timeFilter: "All",
      searchValue: "",
    });
    const weekly = selectEarningsForView(rows, {
      viewMode: "Weekly",
      selectedDateIso: "2026-11-24",
      timeFilter: "All",
      searchValue: "",
    });
    expect(daily).toHaveLength(1);
    expect(weekly.length).toBeGreaterThan(daily.length);
  });
});

describe("earningsTimeLabel", () => {
  it("keeps unknown times unknown", () => {
    expect(earningsTimeLabel(null)).toBe("Unknown");
    expect(earningsTimeLabel("tentative")).toBe("Unknown");
  });
});