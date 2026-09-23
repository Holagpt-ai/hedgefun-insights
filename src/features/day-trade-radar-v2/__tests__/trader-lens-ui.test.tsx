import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RadarGrid } from "../RadarGrid";
import { RadarMobileCard } from "../RadarMobileCard";
import { RadarDetailPanel } from "../RadarDetailPanel";
import { TraderLensBar } from "../TraderLensBar";
import { canonicalizeRadarColumns, defaultRadarColumns } from "../radar-grid-columns";
import type { RadarRankedRow } from "../types";

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

vi.mock("@/hooks/useRadarFloatForSymbols", () => ({
  useRadarFloatForSymbols: () => ({
    bySymbol: new Map(),
    isPending: false,
    getFloat: () => null,
  }),
}));

vi.mock("@/hooks/useRecentProviderNewsForSymbols", () => ({
  useRecentProviderNewsForSymbols: () => ({
    bySymbol: new Map(),
    isPending: false,
    getHeadline: () => undefined,
    getStatus: () => "empty",
  }),
}));

function ranked(overrides: Partial<RadarRankedRow> = {}): RadarRankedRow {
  return {
    tab_id: "day_trade_radar",
    symbol: "AAA",
    company_name: "Alpha",
    price: 10,
    change_percent: null,
    volume: 1_000_000,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: null,
    rvol_20d: null,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    day_high: 11,
    day_low: 9,
    provider_as_of: "2026-09-16T15:00:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-16T15:05:00.000Z",
    rank: 1,
    signal: "TOP LEADER",
    hod_distance_percent: 2,
    rolling_volume_5s: null,
    move_15s_pct: 1.2,
    move_60s_pct: 3.4,
    ...overrides,
  };
}

describe("Radar time and short-window labels", () => {
  it("labels provider_as_of as Data Time and never Trigger Time", () => {
    render(
      <MemoryRouter>
        <RadarGrid
          rows={[ranked()]}
          selectedSymbol="AAA"
          isPro
          freeRowLimit={3}
          onSelect={() => {}}
          visibleColumns={canonicalizeRadarColumns(["data_time"])}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Data Time")).toBeInTheDocument();
    expect(screen.queryByText("Trigger Time")).not.toBeInTheDocument();
    expect(screen.queryByText("Trigger")).not.toBeInTheDocument();
  });

  it("keeps short-window moves labeled 15s Move / 60s Move, not Day Move", () => {
    render(
      <MemoryRouter>
        <RadarDetailPanel
          row={ranked()}
          inactive={false}
          chartStatus="idle"
          chartBars={[]}
          latestBarIso={null}
          chartError={null}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("15s Move")).toBeInTheDocument();
    expect(screen.getByText("60s Move")).toBeInTheDocument();
    expect(screen.getByText("Data Time")).toBeInTheDocument();
    expect(screen.queryByText("Day Move")).not.toBeInTheDocument();
    expect(screen.queryByText("Trigger Time")).not.toBeInTheDocument();
  });
});

describe("Radar mobile card render", () => {
  it("keeps the compact mobile card and does not mount a column selector", () => {
    render(
      <MemoryRouter>
        <RadarMobileCard
          row={ranked()}
          selected={false}
          isPro
          freeRowLimit={3}
          onSelect={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("AAA")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Price info" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Day Range info" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Columns" })).not.toBeInTheDocument();
    expect(screen.queryByText("5s Volume")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Price info" }));
    expect(
      screen.getByText("The latest last price supplied by the active market-data source."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Day Range info" }));
    expect(
      screen.getByText(
        "Shows the stock's low and high for the current trading session. The marker shows where the current price is trading inside that range.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("adaptive-day-range")).toBeInTheDocument();
  });
});

describe("compact Trader Lens bar", () => {
  it("hides Price Min/Max until Custom or Filters, and lists All Radar Candidates first", () => {
    render(
      <TraderLensBar
        presetId="momentum_2_20"
        minInput="2"
        maxInput="20"
        visibleCount={2}
        radarCount={3}
        visibleColumns={defaultRadarColumns()}
        sessionMoveUnavailable
        onPresetChange={() => {}}
        onMinChange={() => {}}
        onMaxChange={() => {}}
        onReset={() => {}}
        onToggleColumn={() => {}}
        onResetColumns={() => {}}
      />,
    );
    const select = screen.getByLabelText("Trader Lens preset") as HTMLSelectElement;
    expect(select.value).toBe("momentum_2_20");
    expect(screen.getByRole("option", { name: "Core Momentum $2–$20" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "All Radar Candidates" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Price min")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Price max")).not.toBeInTheDocument();
    expect(
      screen.getByText("Price filter active; regular-session move unavailable on this source."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByLabelText("Price min")).toBeInTheDocument();
    expect(screen.getByLabelText("Min Move %")).toBeInTheDocument();
    expect(screen.getByLabelText("Min Volume")).toBeInTheDocument();
    expect(screen.getByLabelText("Min RVOL 20D")).toBeInTheDocument();
    expect(screen.getByText("Float")).toBeInTheDocument();
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
  });

  it("shows Price Min/Max inline when Custom is selected", () => {
    render(
      <TraderLensBar
        presetId="custom"
        minInput="3"
        maxInput="8"
        visibleCount={2}
        radarCount={3}
        visibleColumns={defaultRadarColumns()}
        onPresetChange={() => {}}
        onMinChange={() => {}}
        onMaxChange={() => {}}
        onReset={() => {}}
        onToggleColumn={() => {}}
        onResetColumns={() => {}}
      />,
    );
    expect(screen.getByLabelText("Price min")).toBeInTheDocument();
    expect(screen.getByLabelText("Price max")).toBeInTheDocument();
  });

  it("exposes Day Range tooltip copy from the scanner field registry on the desktop header", () => {
    render(
      <MemoryRouter>
        <RadarGrid
          rows={[ranked()]}
          selectedSymbol="AAA"
          isPro
          freeRowLimit={3}
          onSelect={() => {}}
          visibleColumns={canonicalizeRadarColumns(["day_range"])}
        />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Day Range info" }));
    expect(
      screen.getByText(
        "A stock holding near its high may indicate stronger momentum, while a stock far below its high may have already faded.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Low $2.00, High $5.00, Last $4.70 places the marker near the right side of the range.",
      ),
    ).toBeInTheDocument();
  });
});
