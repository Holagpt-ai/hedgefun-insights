import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Navigate } from "react-router-dom";
import AiTraderPage from "@/pages/dashboard/AiTraderPage";
import {
  AI_TRADER_DASHBOARD_PATH,
  AI_TRADER_LEGACY_GAME_PATH,
  AI_TRADER_OFF_COPY,
  AI_TRADER_WAITING_COPY,
} from "@/lib/ai-trader/operating-mode";
import { AI_TRADER_WORKSPACE_TABS } from "@/lib/ai-trader/contracts";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { plan: "free" } }),
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

describe("AiTraderPage", () => {
  it("renders the OFF shell with every workspace tab and no trading evidence", () => {
    renderAt(AI_TRADER_DASHBOARD_PATH);

    expect(screen.getByRole("heading", { name: "AI Trader" })).toBeInTheDocument();
    expect(screen.getAllByText(AI_TRADER_OFF_COPY).length).toBeGreaterThan(0);
    expect(screen.queryByText(AI_TRADER_WAITING_COPY)).not.toBeInTheDocument();
    expect(screen.getByText("Not active")).toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();

    for (const tab of AI_TRADER_WORKSPACE_TABS) {
      expect(screen.getByRole("tab", { name: tab })).toBeInTheDocument();
    }

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Research" }));
    expect(screen.getByText(/Pro includes AI Trader research/)).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Watchlist" }));
    expect(screen.getAllByText(AI_TRADER_OFF_COPY).length).toBeGreaterThan(0);
    expect(screen.queryByText(AI_TRADER_WAITING_COPY)).not.toBeInTheDocument();
  });

  it("redirects the legacy game path to AI Trader", () => {
    renderAt(AI_TRADER_LEGACY_GAME_PATH);
    expect(screen.getByRole("heading", { name: "AI Trader" })).toBeInTheDocument();
    expect(screen.getAllByText(AI_TRADER_OFF_COPY).length).toBeGreaterThan(0);
  });
});
