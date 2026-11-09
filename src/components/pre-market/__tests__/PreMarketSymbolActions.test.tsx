import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "test-user" } }),
}));

import { PreMarketSymbolActions } from "@/components/pre-market/PreMarketSymbolActions";

describe("PreMarketSymbolActions", () => {
  it("includes securityId on workflow routes when provided", () => {
    render(
      <MemoryRouter>
        <PreMarketSymbolActions symbol="AAPL" securityId="11111111-1111-4111-8111-111111111111" />
      </MemoryRouter>,
    );
    const ai = screen.getByRole("link", { name: "AI Analyst for AAPL" }) as HTMLAnchorElement;
    expect(ai.getAttribute("href")).toContain("securityId=");
  });

  it("keeps AI Analyst and Chart as primary actions and exposes overflow in More", () => {
    render(
      <MemoryRouter>
        <PreMarketSymbolActions symbol="AAPL" />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "AI Analyst for AAPL" })).toBeTruthy();
    const chart = screen.getByRole("link", { name: "Chart for AAPL" }) as HTMLAnchorElement;
    expect(chart.getAttribute("href")).toBe("/chart/AAPL");
    expect(chart.getAttribute("href")).not.toMatch(/^\/stocks\//);
    expect(screen.getByRole("button", { name: "More actions for AAPL" })).toBeTruthy();
    expect(screen.getAllByLabelText("Catalyst for AAPL").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Watchlist for AAPL").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Journal for AAPL").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("Action Center for AAPL").length).toBeGreaterThan(0);
    const screeners = screen.getAllByLabelText("Screeners for AAPL")[0] as HTMLAnchorElement;
    expect(screeners.getAttribute("href")).toContain("/dashboard/screeners?symbol=AAPL");
  });
});
