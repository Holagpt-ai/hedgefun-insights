import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ScreenerTable } from "@/components/dashboard/ScreenerTable";
import { getScreenerTabById } from "@/config/screener-tabs.config";
import type { ScreenerResultRow } from "@/lib/screeners/contract";
import { compareCandidatesVolumeFirst } from "@/lib/screeners/radar-v2-adapter";

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

function row(overrides: Partial<ScreenerResultRow> = {}): ScreenerResultRow {
  return {
    tab_id: "gappers",
    symbol: "AAA",
    company_name: "Alpha",
    price: 10,
    change_percent: 5,
    volume: 5_000_000,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: 2_000_000,
    rvol_20d: 2.5,
    float_shares: null,
    gap_percent: 6,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    day_high: 11,
    day_low: 9,
    provider_as_of: "2026-09-18T15:00:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-18T15:05:00.000Z",
    ...overrides,
  };
}

function renderGappers(rows: ScreenerResultRow[]) {
  const tab = getScreenerTabById("gappers");
  if (!tab) throw new Error("missing gappers tab");
  return render(
    <MemoryRouter>
      <ScreenerTable tab={tab} isPro rows={rows} status="available" />
    </MemoryRouter>,
  );
}

describe("ScreenerTable RVOL 20D and Dollar Volume", () => {
  it("renders valid RVOL 20D and computed Dollar Volume", () => {
    renderGappers([row({ price: 12, volume: 10_000_000, rvol_20d: 3.8 })]);
    expect(screen.getAllByText("$120.0M").length).toBeGreaterThan(0);
    expect(screen.getAllByText("3.8×").length).toBeGreaterThan(0);
    expect(screen.queryByText("NaN")).not.toBeInTheDocument();
    expect(screen.queryByText("Infinity")).not.toBeInTheDocument();
  });

  it("renders null RVOL as — and does not substitute Vol/Prior", () => {
    renderGappers([
      row({
        rvol_20d: null,
        volume_ratio_prior_session: 8.1,
        prior_session_volume: 1_000_000,
      }),
    ]);
    const mobileRvol = screen.getByTestId("screener-mobile-rvol-20d");
    expect(within(mobileRvol).getByText("—")).toBeInTheDocument();
    expect(within(mobileRvol).queryByText("8.1×")).not.toBeInTheDocument();
  });

  it("renders non-finite RVOL as —", () => {
    renderGappers([row({ rvol_20d: Number.POSITIVE_INFINITY as unknown as number })]);
    expect(within(screen.getByTestId("screener-mobile-rvol-20d")).getByText("—")).toBeInTheDocument();
    expect(screen.queryByText("Infinity×")).not.toBeInTheDocument();
    expect(screen.queryByText("NaN×")).not.toBeInTheDocument();
  });

  it("renders missing price as — for Dollar Volume", () => {
    renderGappers([row({ price: null, volume: 5_000_000 })]);
    expect(within(screen.getByTestId("screener-mobile-dollar-volume")).getByText("—")).toBeInTheDocument();
  });

  it("keeps valid numeric zero instead of converting it to missing", () => {
    renderGappers([row({ price: 10, volume: 0, rvol_20d: 0 })]);
    expect(screen.getAllByText("$0").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0.0×").length).toBeGreaterThan(0);
    expect(within(screen.getByTestId("screener-mobile-dollar-volume")).queryByText("—")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("screener-mobile-rvol-20d")).queryByText("—")).not.toBeInTheDocument();
  });

  it("does not change Discovery order and keeps the incoming volume-first rows", () => {
    const rows = [
      row({ symbol: "HIGH", volume: 9_000_000, rvol_20d: 1.1, price: 2 }),
      row({ symbol: "LOW", volume: 1_000_000, rvol_20d: 20, price: 50 }),
    ];
    renderGappers(rows);
    const symbols = screen.getAllByRole("link").filter((link) => /\/stocks\/(HIGH|LOW)$/.test(link.getAttribute("href") ?? ""));
    expect(symbols[0]).toHaveTextContent("HIGH");
    expect(symbols[1]).toHaveTextContent("LOW");
    expect(screen.queryByText("▲")).not.toBeInTheDocument();
    expect(screen.queryByText("▼")).not.toBeInTheDocument();
  });

  it("shows both metrics on the mobile card", () => {
    renderGappers([row()]);
    expect(screen.getByTestId("screener-mobile-dollar-volume")).toHaveTextContent("$ Vol");
    expect(screen.getByTestId("screener-mobile-rvol-20d")).toHaveTextContent("RVOL 20D");
  });

  it("does not fabricate sample fallback values", () => {
    renderGappers([row({ rvol_20d: null, price: null })]);
    expect(screen.queryByText(/sample/i)).not.toBeInTheDocument();
    expect(screen.queryByText("1.0×")).not.toBeInTheDocument();
    expect(screen.queryByText("$1.0M")).not.toBeInTheDocument();
  });

  it("leaves compareCandidatesVolumeFirst as volume-first", () => {
    const high = {
      symbol: "AAA",
      session_volume: 5_000_000,
      volume_60s: 1,
      dollar_volume_60s: 1,
    };
    const low = {
      symbol: "BBB",
      session_volume: 1_000_000,
      volume_60s: 9,
      dollar_volume_60s: 9_000_000,
    };
    expect(compareCandidatesVolumeFirst(high as never, low as never)).toBeLessThan(0);
  });
});
