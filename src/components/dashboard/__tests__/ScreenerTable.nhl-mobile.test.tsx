import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

function nhlRow(
  symbol: string,
  overrides: Partial<ScreenerResultRow> = {},
): ScreenerResultRow {
  return {
    tab_id: "new_highs_lows",
    symbol,
    company_name: symbol,
    price: 15,
    change_percent: 2,
    volume: 1_000_000,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: null,
    rvol_20d: null,
    float_shares: null,
    gap_percent: null,
    high_52w: 20,
    low_52w: 5,
    range_event: "both",
    market_cap: null,
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    day_high: 21,
    day_low: 4.5,
    provider_as_of: "2026-09-21T14:00:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-21T14:05:00.000Z",
    ...overrides,
  };
}

describe("ScreenerTable NHL mobile cards", () => {
  it("renders compact side-aware distance for both-boundary events", () => {
    const tab = getScreenerTabById("new_highs_lows");
    render(
      <MemoryRouter>
        <ScreenerTable tab={tab!} isPro status="available" rows={[nhlRow("DUAL")]} />
      </MemoryRouter>,
    );

    const mobileCards = document.querySelectorAll(".md\\:hidden .rounded-lg.border");
    expect(mobileCards.length).toBeGreaterThan(0);
    const cardText = mobileCards[0]?.textContent ?? "";
    expect(cardText).toMatch(/Dist/);
    expect(cardText).toMatch(/H \+5\.00%/);
    expect(cardText).toMatch(/L -10\.00%/);
    expect(screen.getAllByTitle(/above prior 52W high/).length).toBeGreaterThan(0);
  });

  it("omits distance on mobile when required day side inputs are missing", () => {
    const tab = getScreenerTabById("new_highs_lows");
    render(
      <MemoryRouter>
        <ScreenerTable
          tab={tab!}
          isPro
          status="available"
          rows={[
            nhlRow("HIGHONLY", {
              range_event: "new_high",
              day_high: null,
              day_low: 9,
            }),
          ]}
        />
      </MemoryRouter>,
    );

    const mobileCards = document.querySelectorAll(".md\\:hidden .rounded-lg.border");
    const cardText = mobileCards[0]?.textContent ?? "";
    expect(cardText).not.toMatch(/Dist/);
  });
});
