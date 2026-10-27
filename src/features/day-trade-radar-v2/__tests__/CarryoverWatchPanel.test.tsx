import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CarryoverCandidateView } from "@/lib/radar/carryover-watch";
import { CarryoverWatchPanel } from "../CarryoverWatchPanel";

vi.mock("@/hooks/useCarryoverWatch", () => ({
  useCarryoverWatch: () => mockState,
}));

vi.mock("@/hooks/useAddToWatchlist", () => ({
  useAddToWatchlist: () => ({
    add: vi.fn(),
    isAdded: () => false,
    pendingSymbol: null,
  }),
}));

let mockState: {
  loading: boolean;
  view: {
    status: "ready";
    sessionDate: string;
    sessionLabel: string;
    snapshotRecordedAtLabel: string | null;
    unavailableReason: null;
    sourceNote: null;
    pillarNote: null;
    candidates: CarryoverCandidateView[];
    withheldInvalidQuotes: number;
    historicalNotice: string;
  } | null;
};

function candidate(partial: Partial<CarryoverCandidateView> & { symbol: string }): CarryoverCandidateView {
  return {
    classification: "previously_qualified",
    classificationLabel: "Previously qualified",
    price: 5,
    movePct: 12,
    sessionVolume: 2_000_000,
    velocity: 40_000,
    accelerationPct: null,
    hodLabel: "HOD unavailable",
    sessionEvidence: "Regular session · power-hour acceleration",
    floatLabel: "Float unavailable",
    catalystLabel: "Catalyst unverified",
    pillarLines: ["move: pass", "float: unavailable"],
    evaluatedAtLabel: "Oct 13, 3:30 PM ET",
    missingEvidence: ["float", "hod"],
    handoffs: {
      catalyst: "/dashboard/catalyst?symbol=AAA",
      aiAnalyst: "/dashboard/ai-analyst?symbol=AAA",
      journal: "/dashboard/journal",
      actionCenter: "/dashboard/action-center",
      watchlist: "/dashboard/watchlist?symbol=AAA",
    },
    ...partial,
  };
}

describe("CarryoverWatchPanel compact cards", () => {
  it("hides pillar lines until Details is opened", () => {
    mockState = {
      loading: false,
      view: {
        status: "ready",
        sessionDate: "2026-10-13",
        sessionLabel: "Mon, Oct 13",
        snapshotRecordedAtLabel: "Oct 13, 4:05 PM ET",
        unavailableReason: null,
        sourceNote: null,
        pillarNote: null,
        candidates: [candidate({ symbol: "HEAVY" })],
        withheldInvalidQuotes: 0,
        historicalNotice: "Historical prior-session record.",
      },
    };

    render(
      <MemoryRouter>
        <CarryoverWatchPanel nowMs={Date.now()} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Prior session · not current/i)).toBeInTheDocument();
    expect(screen.queryByText("move: pass")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(screen.getByText("move: pass")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Journal" })).toHaveAttribute("href", "/dashboard/journal");
    fireEvent.click(screen.getByRole("button", { name: "Hide details" }));
    expect(screen.queryByText("move: pass")).toBeNull();
  });
});
