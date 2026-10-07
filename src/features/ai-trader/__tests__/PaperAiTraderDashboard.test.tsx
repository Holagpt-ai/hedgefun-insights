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
    expect(screen.getByRole("heading", { name: /Session review/i })).toBeInTheDocument();
  });

  it("explains observe vs paper mode and toggles paper engine", () => {
    render(
      <MemoryRouter>
        <PaperAiTraderDashboard />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Observe mode logs radar opportunities/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Paper$/i }));
    expect(screen.getByText(/turn the paper engine on/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Paper engine OFF/i }));
    expect(screen.getByText(/Paper mode is active/i)).toBeInTheDocument();
  });
});
