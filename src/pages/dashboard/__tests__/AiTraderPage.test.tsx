import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Navigate } from "react-router-dom";
import AiTraderPage from "@/pages/dashboard/AiTraderPage";
import {
  AI_TRADER_DASHBOARD_PATH,
  AI_TRADER_LEGACY_GAME_PATH,
} from "@/lib/ai-trader/operating-mode";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { plan: "free" } }),
}));

vi.mock("@/hooks/useScreenerData", () => ({
  useScreenerData: () => ({
    status: "available",
    rows: [],
    syncedAt: null,
    providerAsOfMax: null,
    marketFeed: null,
    source: null,
    session: null,
    closedSnapshot: false,
    radarDiagnostic: null,
    truthState: null,
    nhlBaselineStatus: null,
    tabEvaluationEvidence: null,
    repeatMoversView: null,
    repeatMoversLoadState: "idle",
  }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path={AI_TRADER_DASHBOARD_PATH} element={<AiTraderPage />} />
        <Route path={AI_TRADER_LEGACY_GAME_PATH} element={<Navigate to={AI_TRADER_DASHBOARD_PATH} replace />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AiTraderPage shadow dashboard", () => {
  it("renders paper AI trader with observe default and live disabled", () => {
    renderAt(AI_TRADER_DASHBOARD_PATH);

    expect(screen.getByRole("heading", { name: "AI Trader" })).toBeInTheDocument();
    expect(screen.getByText("OBSERVE MODE")).toBeInTheDocument();
    expect(screen.getByText("Live trading disabled")).toBeInTheDocument();
    expect(screen.getByText("Paper engine OFF")).toBeInTheDocument();
    expect(screen.getByText(/Radar feed: connected/i)).toBeInTheDocument();
  });

  it("redirects the legacy game path to AI Trader", () => {
    renderAt(AI_TRADER_LEGACY_GAME_PATH);
    expect(screen.getByRole("heading", { name: "AI Trader" })).toBeInTheDocument();
  });

  it("allows toggling paper mode and kill switch without live controls", () => {
    renderAt(AI_TRADER_DASHBOARD_PATH);
    fireEvent.click(screen.getByRole("button", { name: "Paper" }));
    expect(screen.getByText("PAPER MODE")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Activate kill switch" }));
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /live/i })).not.toBeInTheDocument();
  });
});
