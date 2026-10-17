import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StockStatsTable from "./StockStatsTable";

const FIXED_NOW = new Date("2026-03-16T18:00:00.000Z"); // Monday ~2:00 PM ET (EDT)

describe("StockStatsTable day range labels", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const baseProps = {
    details: {},
    dividends: [],
    yearAggs: [],
    loading: false,
  };

  function rowText(label: string): string {
    const labelNode = screen.getByText(label, { exact: false });
    const row = labelNode.closest("div");
    return row?.textContent ?? "";
  }

  it("shows verified current-session high/low without prior-session wording", () => {
    const sessionMs = Date.parse("2026-03-16T16:00:00.000Z");
    render(
      <StockStatsTable
        {...baseProps}
        snapshot={{
          day: { h: 110, l: 95, c: 105, v: 1000, t: sessionMs },
          prevDay: { c: 100 },
        }}
      />,
    );

    expect(rowText("High")).toContain("$110.00");
    expect(rowText("Low")).toContain("$95.00");
    expect(rowText("Day's Range")).toBe("Day's Range$95.00 - $110.00");
    expect(screen.queryByText(/prior session/i)).toBeNull();
    expect(screen.queryByText(/unverified/i)).toBeNull();
  });

  it("shows verified prior-session labels with observation date", () => {
    const fridayMs = Date.parse("2026-03-13T20:00:00.000Z");
    render(
      <StockStatsTable
        {...baseProps}
        snapshot={{
          day: { h: 108, l: 92, c: 100, v: 500, t: fridayMs },
          prevDay: { c: 98 },
        }}
      />,
    );

    expect(rowText("Prior session high")).toContain("$108.00");
    expect(rowText("Prior session low")).toContain("$92.00");
    expect(rowText("Day's Range")).toMatch(/prior session · 2026-03-13/);
    expect(screen.queryByText(/unverified/i)).toBeNull();
  });

  it("discloses unverified session date for previous-day high/low without timestamps", () => {
    render(
      <StockStatsTable
        {...baseProps}
        snapshot={{
          day: { c: 0, v: 0 },
          prevDay: { h: 50, l: 45, c: 48 },
        }}
      />,
    );

    expect(rowText("High (unverified session date)")).toContain("$50.00");
    expect(rowText("Low (unverified session date)")).toContain("$45.00");
    expect(rowText("Day's Range")).toMatch(/Session date unverified/);
    expect(screen.queryByText(/prior session high/i)).toBeNull();
    expect(screen.queryByText(/prior session ·/)).toBeNull();
  });
});
