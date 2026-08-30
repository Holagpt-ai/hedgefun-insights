import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { plan: "free" } }),
}));

vi.mock("@/hooks/useActionCenter", () => ({
  useActionCenter: () => ({
    briefType: "am",
    summary: { watchlistAlerts: 0, unusualActivity: 0, catalystEvents: 0, openTrades: 0 },
    snapshot: { bullish: 0, bearish: 0, neutral: 0, dataUnavailable: 0, awaitingRefresh: 0 },
    feed: [],
    tasks: [],
    leaders: [],
    catalystWatch: [],
    savedEventIds: new Set<string>(),
    reviewedEventIds: new Set<string>(),
    errors: {},
    loading: { alerts: false, analyses: false, catalyst: false, trades: false, leaders: false },
  }),
}));

vi.mock("@/hooks/useCatalystEnrichmentForSymbols", () => ({
  useCatalystEnrichmentForSymbols: () => ({ data: undefined }),
}));

vi.mock("@/components/dashboard/AIBriefCard", () => ({
  AIBriefCard: () => <div>brief</div>,
}));

import ActionCenter from "@/pages/dashboard/ActionCenter";

describe("Action Center generic workflow tiles", () => {
  it("Continue Workflow Watchlist stays unparameterized", () => {
    render(
      <MemoryRouter>
        <ActionCenter />
      </MemoryRouter>,
    );
    const tile = screen.getByRole("link", {
      name: /watchlist\s+check the names you are actively tracking/i,
    }) as HTMLAnchorElement;
    expect(tile.getAttribute("href")).toBe("/dashboard/watchlist");
    const snapshot = screen.getByRole("link", { name: /open watchlist/i }) as HTMLAnchorElement;
    expect(snapshot.getAttribute("href")).toBe("/dashboard/watchlist");
  });
});
