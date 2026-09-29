import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MorningOpportunityBoard } from "@/components/pre-market/MorningOpportunityBoard";
import type { MorningOpportunityBoard as BoardModel } from "@/lib/am-inbox/morning-opportunity-board";

const model: BoardModel = {
  emptyMessage: null,
  sections: [
    {
      id: "top_momentum",
      title: "Top Momentum",
      cards: [
        {
          symbol: "RUN",
          section: "top_momentum",
          eventType: "RUNNING_UP",
          eventLabel: "Running Up",
          detectedAt: "2026-09-29T13:00:00.000Z",
          price: 4,
          volume: 2_000_000,
          dollarVolume: 8_000_000,
          rvol5m: 2.5,
          gapPercent: null,
          distanceFromHodPct: 0.4,
          vwapSide: "above",
          catalystStatus: "pending",
          trust: "DELAYED",
          asOf: "2026-09-29T13:00:00.000Z",
          continuationCategory: null,
          securityId: null,
        },
      ],
    },
  ],
};

describe("MorningOpportunityBoard", () => {
  it("renders symbol workflow links and no empty categories", () => {
    render(
      <MemoryRouter>
        <MorningOpportunityBoard model={model} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "AI" }).getAttribute("href")).toBe(
      "/dashboard/ai?symbol=RUN&event=RUNNING_UP",
    );
    expect(screen.getByRole("link", { name: "Action Center" }).getAttribute("href")).toBe(
      "/dashboard/action-center?symbol=RUN&event=RUNNING_UP",
    );
    expect(screen.getByText("Catalyst pending")).toBeInTheDocument();
    expect(screen.getByText("Delayed")).toBeInTheDocument();
    expect(screen.queryByText("Day-Two Watch")).not.toBeInTheDocument();
  });

  it("shows the empty message without sample symbols", () => {
    render(
      <MemoryRouter>
        <MorningOpportunityBoard model={{ sections: [], emptyMessage: "No qualifying movers yet" }} />
      </MemoryRouter>,
    );
    expect(screen.getByText("No qualifying movers yet")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
