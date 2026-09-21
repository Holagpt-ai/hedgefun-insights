import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ScreenerTable } from "../ScreenerTable";
import { getScreenerTabById } from "@/config/screener-tabs.config";
import type { ScreenerResultRow } from "@/lib/screeners/contract";

vi.mock("@/hooks/useAddToWatchlist", () => ({
  useAddToWatchlist: () => ({
    add: vi.fn(),
    isAdded: () => false,
    pendingSymbol: null,
  }),
}));

vi.mock("@/hooks/useCatalystEnrichmentForSymbols", () => ({
  useCatalystEnrichmentForSymbols: () => ({
    data: undefined,
    isPending: false,
    isFetching: false,
    isError: false,
  }),
}));

function row(symbol: string, volume: number, price = 10): ScreenerResultRow {
  return {
    tab_id: "gappers",
    symbol,
    company_name: symbol,
    price,
    change_percent: 12,
    volume,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: null,
    rvol_20d: 5,
    float_shares: null,
    gap_percent: 12,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: 100_000,
    volume_ratio_prior_session: volume / 100_000,
    day_high: 11,
    day_low: 9,
    provider_as_of: "2026-09-21T14:00:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-21T14:05:00.000Z",
  };
}

function renderTable() {
  const tab = getScreenerTabById("gappers");
  return render(
    <MemoryRouter>
      <ScreenerTable
        tab={tab!}
        isPro
        status="available"
        rows={[row("ABC", 5_000_000, 10), row("XYZ", 100_000, 10), row("LMN", 8_000_000, 12)]}
      />
    </MemoryRouter>,
  );
}

describe("ScreenerTable Filters V1", () => {
  it("10/11/12. filters hide rows, keep Discovery ranks, and Clear Filters restores them", () => {
    renderTable();
    const table = screen.getAllByRole("table")[0];
    expect(table.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(table).toHaveTextContent("#1");
    expect(table).toHaveTextContent("#3");

    fireEvent.change(screen.getAllByLabelText("Min Volume")[0], { target: { value: "1000000" } });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(table).toHaveTextContent("ABC");
    expect(table).toHaveTextContent("LMN");
    expect(table).not.toHaveTextContent("XYZ");
    expect(table).toHaveTextContent("#1");
    expect(table).toHaveTextContent("#3");
    expect(table).not.toHaveTextContent("#2");

    fireEvent.click(screen.getAllByRole("button", { name: "Clear Filters" })[0]);
    expect(table.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(table).toHaveTextContent("XYZ");
  });

  it("13. active filter count updates", () => {
    renderTable();
    fireEvent.change(screen.getAllByLabelText("Min Price")[0], { target: { value: "2" } });
    fireEvent.change(screen.getAllByLabelText("Max Price")[0], { target: { value: "20" } });
    expect(screen.getAllByTestId("active-filter-count")[0]).toHaveTextContent("2 active");
  });

  it("14. mobile control renders", () => {
    renderTable();
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getAllByLabelText("Min RVOL 20D").length).toBeGreaterThan(0);
  });

  it("17. default Discovery order is unchanged before filters", () => {
    renderTable();
    const table = screen.getAllByRole("table")[0];
    const bodyRows = table.querySelectorAll("tbody tr");
    expect(bodyRows[0]).toHaveTextContent("ABC");
    expect(bodyRows[1]).toHaveTextContent("XYZ");
    expect(bodyRows[2]).toHaveTextContent("LMN");
    expect(bodyRows[0]).toHaveTextContent("#1");
    expect(bodyRows[2]).toHaveTextContent("#3");
  });
});
