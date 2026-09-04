import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const hookState = {
  status: "available" as const,
  rows: [] as unknown[],
  syncedAt: "2026-09-04T15:12:30.000Z",
  providerAsOfMax: "2026-09-04T15:00:00.000Z",
  source: "radar-v2" as const,
  session: "pre-market" as string | null,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { plan: "pro" } }),
}));

vi.mock("@/hooks/useScreenerData", () => ({
  useScreenerData: () => ({ ...hookState }),
}));

vi.mock("@/components/dashboard/ScreenerTable", () => ({
  ScreenerTable: ({ session }: { session?: string | null }) => (
    <div data-testid="screener-table">{session ?? "none"}</div>
  ),
}));

vi.mock("@/features/day-trade-radar-v2/DayTradeRadarV2", () => ({
  DayTradeRadarV2: ({
    source,
    session,
  }: {
    source?: string | null;
    session?: string | null;
  }) => (
    <div data-testid="day-trade-radar-v2">{`${source ?? "none"}:${session ?? "none"}`}</div>
  ),
}));

import Screeners from "@/pages/dashboard/Screeners";

function renderScreeners() {
  return render(
    <MemoryRouter>
      <Screeners />
    </MemoryRouter>,
  );
}

describe("Screeners session propagation (D12)", () => {
  beforeEach(() => {
    hookState.source = "radar-v2";
    hookState.session = "pre-market";
  });

  it("passes the accepted Radar session into Day Trade Radar without clock inference", () => {
    renderScreeners();
    expect(screen.getByTestId("day-trade-radar-v2").textContent).toBe("radar-v2:pre-market");
    expect(screen.getByText(/Radar V2 Sentinel pre-market candidates/i)).toBeInTheDocument();
  });

  it("11. PM → RTH generation transition updates session without a page reload", () => {
    const { rerender } = renderScreeners();
    expect(screen.getByTestId("day-trade-radar-v2").textContent).toBe("radar-v2:pre-market");
    hookState.session = "market";
    rerender(
      <MemoryRouter>
        <Screeners />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("day-trade-radar-v2").textContent).toBe("radar-v2:market");
    expect(screen.getByText(/regular-session candidates/i)).toBeInTheDocument();
    expect(screen.queryByText(/pre-market candidates/i)).not.toBeInTheDocument();
  });

  it("12. RTH → AH transition updates session without a page reload", () => {
    hookState.session = "market";
    const { rerender } = renderScreeners();
    expect(screen.getByTestId("day-trade-radar-v2").textContent).toBe("radar-v2:market");
    hookState.session = "after-hours";
    rerender(
      <MemoryRouter>
        <Screeners />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("day-trade-radar-v2").textContent).toBe("radar-v2:after-hours");
    expect(screen.getByText(/after-hours candidates/i)).toBeInTheDocument();
    expect(screen.queryByText(/regular-session candidates/i)).not.toBeInTheDocument();
  });

  it("13. AH → CLOSED stops Radar V2 active-source treatment", () => {
    hookState.source = "screener-results";
    hookState.session = null;
    renderScreeners();
    expect(screen.getByTestId("day-trade-radar-v2").textContent).toBe("screener-results:none");
    expect(screen.queryByText(/Radar V2 Sentinel after-hours/i)).not.toBeInTheDocument();
  });
});
