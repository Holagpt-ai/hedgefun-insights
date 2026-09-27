import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AiTraderLivePreview } from "@/components/home/AiTraderLivePreview";
import DashboardSidebar from "@/components/dashboard/DashboardSidebar";
import { AI_TRADER_OFF_COPY, AI_TRADER_WAITING_COPY } from "@/lib/ai-trader/operating-mode";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { plan: "free" } }),
}));

vi.mock("@/contexts/LanguageContext", () => ({
  useLanguage: () => ({ language: "en", setLanguage: () => {}, t: (key: string) => key }),
}));

describe("AI Trader acquisition surface", () => {
  it("shows the inactive preview and an honest watch dialog", () => {
    render(
      <MemoryRouter>
        <AiTraderLivePreview />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: "AI Trader" })).toBeInTheDocument();
    expect(screen.getByText(AI_TRADER_OFF_COPY)).toBeInTheDocument();
    expect(screen.queryByText(AI_TRADER_WAITING_COPY)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Watch AI Trader" }));

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open AI Trader" })).toHaveAttribute("href", "/dashboard/ai-trader");
    expect(screen.getAllByText(AI_TRADER_OFF_COPY).length).toBeGreaterThan(0);
    expect(screen.queryByText(AI_TRADER_WAITING_COPY)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
  });

  it("replaces the Stocksist Game nav item with AI Trader", () => {
    window.localStorage.setItem("dashboardSidebarCollapsed", "false");
    render(
      <MemoryRouter>
        <DashboardSidebar forceExpanded />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", { name: "AI Trader" });
    expect(link).toHaveAttribute("href", "/dashboard/ai-trader");
    expect(screen.queryByRole("link", { name: "Stocksist Game" })).not.toBeInTheDocument();
  });
});
