import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PreMarketSymbolActions } from "@/components/pre-market/PreMarketSymbolActions";

describe("PreMarketSymbolActions", () => {
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
  });
});
