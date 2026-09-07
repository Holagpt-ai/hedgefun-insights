import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import StocksistGameWaitlistPage from "@/pages/dashboard/StocksistGameWaitlistPage";
import { subscribeToNewsletter } from "@/lib/newsletter";

vi.mock("@/lib/newsletter", () => ({
  subscribeToNewsletter: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

const subscribeMock = vi.mocked(subscribeToNewsletter);

function renderPage() {
  return render(
    <MemoryRouter>
      <StocksistGameWaitlistPage />
    </MemoryRouter>,
  );
}

describe("StocksistGameWaitlistPage", () => {
  beforeEach(() => {
    subscribeMock.mockReset();
  });

  it("renders coming-soon waitlist page", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Stocksist Game" })).toBeInTheDocument();
    expect(screen.getByText("Coming Soon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /join game waitlist/i })).toBeInTheDocument();
  });

  it("submits a valid email and shows success state", async () => {
    subscribeMock.mockResolvedValue({ status: "success" });
    renderPage();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "trader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join game waitlist/i }));

    await waitFor(() =>
      expect(subscribeMock).toHaveBeenCalledWith("trader@example.com", "stocksist_game_waitlist"),
    );
    expect(screen.getByText("You're on the Stocksist Game waitlist.")).toBeInTheDocument();
  });

  it("handles duplicate submissions as joined", async () => {
    subscribeMock.mockResolvedValue({ status: "duplicate" });
    renderPage();

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "existing@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join game waitlist/i }));

    await waitFor(() =>
      expect(subscribeMock).toHaveBeenCalledWith("existing@example.com", "stocksist_game_waitlist"),
    );
    expect(screen.getByText("You're on the Stocksist Game waitlist.")).toBeInTheDocument();
  });
});
