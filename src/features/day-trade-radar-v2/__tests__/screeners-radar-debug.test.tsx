import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { RadarV2LoadDiagnostic } from "@/lib/screeners/radar-v2-diagnostics";

const hookState = {
  status: "available" as const,
  rows: [
    {
      tab_id: "day_trade_radar",
      symbol: "IMRN",
      company_name: "Immuron",
      price: 8,
      change_percent: null,
      volume: 9_000_000,
    },
  ] as unknown[],
  syncedAt: "2026-09-04T20:35:00.000Z",
  providerAsOfMax: "2026-09-04T20:30:00.000Z",
  source: "screener-results" as const,
  session: null as string | null,
  radarDiagnostic: {
    reason: "radar_v2_fetch_error",
    source: "fallback",
    session: "after-hours",
    attempts: 1,
    generationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    declaredCandidateCount: 118,
    lastAttemptReason: "radar_v2_fetch_error",
  } as RadarV2LoadDiagnostic | null,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { plan: "pro" } }),
}));

vi.mock("@/hooks/useScreenerData", () => ({
  useScreenerData: () => ({ ...hookState }),
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

function renderScreeners(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/dashboard/screeners${search}`]}>
      <Screeners />
    </MemoryRouter>,
  );
}

describe("Screeners Radar debug surface (D15)", () => {
  beforeEach(() => {
    hookState.source = "screener-results";
    hookState.session = null;
    hookState.radarDiagnostic = {
      reason: "radar_v2_fetch_error",
      source: "fallback",
      session: "after-hours",
      attempts: 1,
      generationId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      declaredCandidateCount: 118,
      lastAttemptReason: "radar_v2_fetch_error",
    };
  });

  it("1. no radarDebug query => no diagnostic UI", () => {
    renderScreeners();
    expect(screen.queryByTestId("radar-debug")).not.toBeInTheDocument();
    expect(screen.queryByText("RADAR DEBUG")).not.toBeInTheDocument();
  });

  it("2. radarDebug=1 => diagnostic UI visible", () => {
    renderScreeners("?radarDebug=1");
    expect(screen.getByTestId("radar-debug")).toBeInTheDocument();
    expect(screen.getByTestId("radar-debug")).toHaveTextContent("RADAR DEBUG");
  });

  it("does not enable the surface for other radarDebug values", () => {
    renderScreeners("?radarDebug=true");
    expect(screen.queryByTestId("radar-debug")).not.toBeInTheDocument();
  });

  it("3. fallback reason renders", () => {
    renderScreeners("?radarDebug=1");
    const block = screen.getByTestId("radar-debug");
    expect(block).toHaveTextContent("source: fallback");
    expect(block).toHaveTextContent("reason: radar_v2_fetch_error");
    expect(block).toHaveTextContent("session: after-hours");
    expect(block).toHaveTextContent("attempts: 1");
    expect(block).toHaveTextContent("generation: aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee");
    expect(block).toHaveTextContent("declared: 118");
    expect(block).toHaveTextContent("lastAttempt: radar_v2_fetch_error");
    expect(block).toHaveTextContent("synced: 2026-09-04T20:35:00.000Z");
  });

  it("4. radar-v2 available reason renders", () => {
    hookState.source = "radar-v2";
    hookState.session = "after-hours";
    hookState.radarDiagnostic = {
      reason: "radar_v2_available",
      source: "radar-v2",
      session: "after-hours",
      attempts: 1,
      generationId: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      declaredCandidateCount: 118,
      lastAttemptReason: null,
    };
    renderScreeners("?radarDebug=1");
    const block = screen.getByTestId("radar-debug");
    expect(block).toHaveTextContent("source: radar-v2");
    expect(block).toHaveTextContent("reason: radar_v2_available");
    expect(block).toHaveTextContent("session: after-hours");
    expect(block).toHaveTextContent("declared: 118");
  });

  it("5. no secrets / raw rows rendered in the diagnostic block", () => {
    renderScreeners("?radarDebug=1");
    const text = screen.getByTestId("radar-debug").textContent ?? "";
    expect(text).not.toMatch(/service_role|anon_key|eyJ|sbp_|supabase/i);
    expect(text).not.toMatch(/Authorization|Bearer|apikey/i);
    expect(text).not.toContain("IMRN");
    expect(text).not.toContain("Immuron");
    expect(text).not.toContain("9_000_000");
    expect(text).not.toContain("{");
    expect(text).not.toContain("[");
  });

  it("6. diagnostic updates when the decision changes", () => {
    const { rerender } = renderScreeners("?radarDebug=1");
    expect(screen.getByTestId("radar-debug")).toHaveTextContent("reason: radar_v2_fetch_error");
    expect(screen.getByTestId("radar-debug")).toHaveTextContent("source: fallback");

    hookState.source = "radar-v2";
    hookState.session = "after-hours";
    hookState.radarDiagnostic = {
      reason: "radar_v2_available",
      source: "radar-v2",
      session: "after-hours",
      attempts: 2,
      generationId: "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee",
      declaredCandidateCount: 118,
      lastAttemptReason: "generation_race",
    };

    rerender(
      <MemoryRouter initialEntries={["/dashboard/screeners?radarDebug=1"]}>
        <Screeners />
      </MemoryRouter>,
    );

    const block = screen.getByTestId("radar-debug");
    expect(block).toHaveTextContent("reason: radar_v2_available");
    expect(block).toHaveTextContent("source: radar-v2");
    expect(block).toHaveTextContent("attempts: 2");
    expect(block).toHaveTextContent("lastAttempt: generation_race");
  });

  it("7. normal Screeners behavior is unchanged without radarDebug", () => {
    renderScreeners();
    expect(screen.getByRole("heading", { name: "Screeners" })).toBeInTheDocument();
    expect(screen.getByTestId("day-trade-radar-v2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Day Trade Radar/i })).toBeInTheDocument();
    expect(screen.queryByTestId("radar-debug")).not.toBeInTheDocument();
    expect(screen.queryByTestId("screener-table")).not.toBeInTheDocument();
  });

  it("7b. radarDebug=1 does not replace the Day Trade Radar board", () => {
    renderScreeners("?radarDebug=1");
    expect(screen.getByTestId("day-trade-radar-v2")).toBeInTheDocument();
    expect(screen.getByTestId("radar-debug")).toBeInTheDocument();
  });
});
