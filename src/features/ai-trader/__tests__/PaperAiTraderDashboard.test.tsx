import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PaperAiTraderDashboard } from "@/features/ai-trader/PaperAiTraderDashboard";

describe("PaperAiTraderDashboard", () => {
  it("renders paper account shell and live trading disabled", () => {
    render(
      <MemoryRouter>
        <PaperAiTraderDashboard />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /AI Trader/i })).toBeInTheDocument();
    expect(screen.getByText(/Live trading disabled/i)).toBeInTheDocument();
    expect(screen.getByText(/Paper equity/i)).toBeInTheDocument();
  });

  it("shows paper status and symbol workflow links after demo signal", async () => {
    render(
      <MemoryRouter>
        <PaperAiTraderDashboard />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Paper$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Execution OFF/i }));
    fireEvent.click(screen.getByRole("button", { name: /Ingest demo signal/i }));
    expect(await screen.findByText(/PAPER_ENTERED|REJECTED|OBSERVING/)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Catalyst/i }).length).toBeGreaterThan(0);
  });
});
