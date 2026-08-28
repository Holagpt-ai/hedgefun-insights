import { describe, it, expect } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { WatchlistActivityList } from "@/components/pre-market/WatchlistActivityList";
import type { PreMarketWatchlistRow } from "@/types/pre-market";

function row(overrides: Partial<PreMarketWatchlistRow>): PreMarketWatchlistRow {
  return {
    ticker: "AAA",
    company_name: null,
    direction: "bullish",
    explanation: "Quote and signals support a bullish lean.",
    failure_reason: null,
    price: 10,
    change_pct: 1.2,
    volume: 1_000_000,
    rvol: null,
    rvol_class: null,
    market_signals: [],
    session_date: "2026-08-28",
    analyzed_at: "2026-08-28T08:00:00.000Z",
    valid_through: "2026-08-28T13:30:00.000Z",
    awaiting_refresh: false,
    request_status: "succeeded",
    ...overrides,
  };
}

describe("WatchlistActivityList Top 5", () => {
  it("shows the first 5 volume-ordered rows then View All / Show Less", () => {
    const rows = [
      row({ ticker: "AAA", volume: 9_000_000 }),
      row({ ticker: "BBB", volume: 8_000_000 }),
      row({ ticker: "CCC", volume: 7_000_000 }),
      row({ ticker: "DDD", volume: 6_000_000 }),
      row({ ticker: "EEE", volume: 5_000_000 }),
      row({ ticker: "FFF", volume: 4_000_000 }),
      row({ ticker: "GGG", volume: null }),
    ];
    render(
      <MemoryRouter>
        <WatchlistActivityList rows={rows} />
      </MemoryRouter>,
    );
    expect(screen.getByText("AAA")).toBeTruthy();
    expect(screen.getByText("EEE")).toBeTruthy();
    expect(screen.queryByText("FFF")).toBeNull();
    expect(screen.queryByText("GGG")).toBeNull();
    expect(screen.getByRole("button", { name: "View All (7)" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View All (7)" }));
    expect(screen.getByText("FFF")).toBeTruthy();
    expect(screen.getByText("GGG")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show Less" }));
    expect(screen.queryByText("FFF")).toBeNull();
  });

  it("preserves incoming order, including missing volume last", () => {
    const rows = [
      row({ ticker: "HIGH", volume: 2_000_000 }),
      row({ ticker: "MID", volume: 500_000 }),
      row({ ticker: "LOW", volume: 10_000 }),
      row({ ticker: "NONE", volume: null }),
      row({ ticker: "NONE2", volume: null }),
      row({ ticker: "NONE3", volume: null }),
    ];
    render(
      <MemoryRouter>
        <WatchlistActivityList rows={rows} />
      </MemoryRouter>,
    );
    const tickers = screen.getAllByText(/^(HIGH|MID|LOW|NONE|NONE2|NONE3)$/).map((el) => el.textContent);
    expect(tickers).toEqual(["HIGH", "MID", "LOW", "NONE", "NONE2"]);
    expect(screen.queryByText("NONE3")).toBeNull();
  });
});
