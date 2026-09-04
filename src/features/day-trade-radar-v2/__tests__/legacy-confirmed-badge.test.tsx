import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LegacyConfirmedBadge } from "../LegacyConfirmedBadge";
import { RadarGrid } from "../RadarGrid";
import { RadarStatusRail } from "../RadarStatusRail";
import type { RadarRankedRow } from "../types";

vi.mock("@/hooks/useAddToWatchlist", () => ({
  useAddToWatchlist: () => ({
    add: vi.fn(),
    isAdded: () => false,
    pendingSymbol: null,
  }),
}));

vi.mock("@/hooks/useCatalystEnrichmentForSymbols", () => ({
  useCatalystEnrichmentForSymbols: () => ({
    data: undefined,
    isPending: false,
    isFetching: false,
    isError: false,
  }),
}));

function ranked(overrides: Partial<RadarRankedRow> = {}): RadarRankedRow {
  return {
    tab_id: "day_trade_radar",
    symbol: "AAA",
    company_name: "Alpha",
    price: 10,
    change_percent: null,
    volume: 1_000_000,
    avg_volume: null,
    rvol: null,
    float_shares: null,
    gap_percent: null,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    day_high: 11,
    day_low: 9,
    provider_as_of: "2026-09-04T17:00:00.000Z",
    sync_run_id: "11111111-1111-4111-8111-111111111111",
    updated_at: "2026-09-04T17:05:00.000Z",
    rank: 1,
    signal: "TOP LEADER",
    hod_distance_percent: 2,
    ...overrides,
  };
}

describe("LEGACY CONFIRMED badge (D13)", () => {
  it("4. matching confirmed row renders LEGACY CONFIRMED with gate details", () => {
    render(<LegacyConfirmedBadge confirmed />);
    const badge = screen.getByText("LEGACY CONFIRMED");
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute("title")).toContain("$2–$20");
    expect(badge.getAttribute("title")).toContain("+10%");
    expect(badge.getAttribute("title")).toContain("≥5× PRIOR");
  });

  it("does not clutter rows that are not confirmed", () => {
    const { container } = render(<LegacyConfirmedBadge confirmed={false} />);
    expect(container).toBeEmptyDOMElement();
    const { container: missing } = render(<LegacyConfirmedBadge />);
    expect(missing).toBeEmptyDOMElement();
  });

  it("RadarGrid shows the badge only on confirmed Sentinel rows", () => {
    render(
      <MemoryRouter>
        <RadarGrid
          rows={[
            ranked({ symbol: "A", rank: 1, legacy_confirmed: false }),
            ranked({ symbol: "B", rank: 2, signal: "VOLUME LEADER", legacy_confirmed: true }),
          ]}
          selectedSymbol="A"
          isPro
          freeRowLimit={20}
          onSelect={() => {}}
        />
      </MemoryRouter>,
    );
    expect(screen.getAllByText("LEGACY CONFIRMED")).toHaveLength(1);
  });
});

describe("Sentinel vs legacy status rail (D13)", () => {
  function rail(engineSource: "radar-v2-candidates" | "v2.1", session: string | null) {
    return render(
      <RadarStatusRail
        status="available"
        qualifyingCount={2}
        syncedAt="2026-09-04T17:12:30.000Z"
        providerAsOfMax="2026-09-04T17:00:00.000Z"
        followingLeader={false}
        onFollowLeader={() => {}}
        showReturnToLeader={false}
        onReturnToLeader={() => {}}
        engineSource={engineSource}
        session={session}
      />,
    );
  }

  it("12. Sentinel rail never shows legacy criteria chips", () => {
    for (const session of ["pre-market", "market", "after-hours"] as const) {
      const { unmount } = rail("radar-v2-candidates", session);
      expect(screen.getByText("Radar V2 Sentinel")).toBeInTheDocument();
      expect(screen.queryByText("$2–$20 ENTRY")).not.toBeInTheDocument();
      expect(screen.queryByText("+10% CONFIRMED")).not.toBeInTheDocument();
      expect(screen.queryByText("CURRENT VOL ≥5× PRIOR")).not.toBeInTheDocument();
      expect(screen.queryByText("Radar V2.1 snapshot")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("11. legacy fallback rail retains old criteria chips", () => {
    rail("v2.1", null);
    expect(screen.getByText("Radar V2.1 snapshot")).toBeInTheDocument();
    expect(screen.getByText("$2–$20 ENTRY")).toBeInTheDocument();
    expect(screen.getByText("+10% CONFIRMED")).toBeInTheDocument();
    expect(screen.getByText("CURRENT VOL ≥5× PRIOR")).toBeInTheDocument();
  });
});
