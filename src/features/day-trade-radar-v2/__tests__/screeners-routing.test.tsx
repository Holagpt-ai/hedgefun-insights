import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { plan: "pro" } }),
}));

vi.mock("@/hooks/useScreenerData", () => ({
  useScreenerData: () => ({
    status: "empty" as const,
    rows: [],
    syncedAt: null,
    providerAsOfMax: null,
    source: null,
    session: null,
  }),
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

describe("Screeners tab routing", () => {
  it("13. Day Trade Radar renders Radar V2; other tabs keep ScreenerTable", () => {
    render(
      <MemoryRouter>
        <Screeners />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("day-trade-radar-v2")).toBeInTheDocument();
    expect(screen.queryByTestId("screener-table")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Gappers" }));

    expect(screen.queryByTestId("day-trade-radar-v2")).not.toBeInTheDocument();
    expect(screen.getByTestId("screener-table")).toHaveTextContent("gappers");
  });
});
