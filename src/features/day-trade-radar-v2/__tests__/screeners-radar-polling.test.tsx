import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const { useScreenerDataMock } = vi.hoisted(() => ({ useScreenerDataMock: vi.fn() }));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { plan: "pro" } }),
}));

vi.mock("@/hooks/useScreenerData", () => ({
  useScreenerData: useScreenerDataMock,
}));

vi.mock("@/components/dashboard/ScreenerTable", () => ({
  ScreenerTable: ({ tab }: { tab: { id: string } }) => (
    <div data-testid="screener-table">{tab.id}</div>
  ),
}));

vi.mock("@/features/day-trade-radar-v2/DayTradeRadarV2", () => ({
  DayTradeRadarV2: () => <div data-testid="day-trade-radar-v2">radar-v2</div>,
}));

import Screeners from "@/pages/dashboard/Screeners";

const RADAR_REFRESH_MS = 60_000;

function optionsForTab(tabId: string) {
  const call = [...useScreenerDataMock.mock.calls].reverse().find((c) => c[0] === tabId);
  if (!call) throw new Error(`useScreenerData was not called for ${tabId}`);
  return call[1] as { refreshIntervalMs?: number; pauseWhenHidden?: boolean };
}

beforeEach(() => {
  useScreenerDataMock.mockReset();
  useScreenerDataMock.mockReturnValue({
    status: "empty" as const,
    rows: [],
    syncedAt: null,
    providerAsOfMax: null,
    source: null,
  });
});

function renderScreeners() {
  return render(
    <MemoryRouter>
      <Screeners />
    </MemoryRouter>,
  );
}

describe("Screeners Radar-backed tab polling (D5.5)", () => {
  it("1. Day Trade Radar polls on the 60s Radar cadence", () => {
    renderScreeners();
    const opts = optionsForTab("day_trade_radar");
    expect(opts.refreshIntervalMs).toBe(RADAR_REFRESH_MS);
    expect(opts.pauseWhenHidden).toBe(true);
  });

  it("2, 3, 4. Volume Spikes / Gainers-Losers / Unusual Volume poll on the 60s cadence", () => {
    renderScreeners();
    for (const label of ["Volume Spikes", "Gainers / Losers", "Unusual Volume"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
    }
    for (const tabId of ["volume_spikes", "gainers_losers", "unusual_volume"]) {
      const opts = optionsForTab(tabId);
      expect(opts.refreshIntervalMs).toBe(RADAR_REFRESH_MS);
      expect(opts.pauseWhenHidden).toBe(true);
    }
  });

  it("5, 6. Gappers and New Highs/Lows do NOT gain Radar polling", () => {
    renderScreeners();
    fireEvent.click(screen.getByRole("button", { name: "Gappers" }));
    fireEvent.click(screen.getByRole("button", { name: "New Highs / Lows" }));

    expect(optionsForTab("gappers").refreshIntervalMs).toBeUndefined();
    expect(optionsForTab("new_highs_lows").refreshIntervalMs).toBeUndefined();
    // But still one-shot with hidden-pause honored.
    expect(optionsForTab("gappers").pauseWhenHidden).toBe(true);
    expect(optionsForTab("new_highs_lows").pauseWhenHidden).toBe(true);
  });

  it("7. pauseWhenHidden remains enabled for every tab", () => {
    renderScreeners();
    for (const label of [
      "Gappers",
      "Volume Spikes",
      "Gainers / Losers",
      "New Highs / Lows",
      "Unusual Volume",
    ]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
    }
    for (const tabId of [
      "day_trade_radar",
      "gappers",
      "volume_spikes",
      "gainers_losers",
      "new_highs_lows",
      "unusual_volume",
    ]) {
      expect(optionsForTab(tabId).pauseWhenHidden).toBe(true);
    }
  });

  it("never polls faster than 60 seconds", () => {
    renderScreeners();
    for (const label of ["Volume Spikes", "Gainers / Losers", "Unusual Volume"]) {
      fireEvent.click(screen.getByRole("button", { name: label }));
    }
    for (const c of useScreenerDataMock.mock.calls) {
      const opts = c[1] as { refreshIntervalMs?: number };
      if (typeof opts.refreshIntervalMs === "number") {
        expect(opts.refreshIntervalMs).toBeGreaterThanOrEqual(60_000);
      }
    }
  });
});
