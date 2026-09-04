import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { RadarV2Decision } from "@/lib/screeners/radar-v2-adapter";
import type { PreMarketWorkspaceResponse } from "@/types/pre-market";
import {
  RADAR_V2_PM_VOLUME_LEADERS_SUBTITLE,
  LEGACY_VOLUME_LEADERS_SUBTITLE,
} from "@/lib/screeners/radar-v2-volume-leaders";

const radarState: { enabled: boolean; decision: RadarV2Decision | null; loading: boolean } = {
  enabled: false,
  decision: null,
  loading: false,
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { plan: "pro" }, user: { id: "u1" } }),
}));

vi.mock("@/hooks/usePageSeo", () => ({
  usePageSeo: () => {},
}));

vi.mock("@/components/dashboard/AIBriefCard", () => ({
  AIBriefCard: () => null,
}));

vi.mock("@/hooks/useRadarV2VolumeLeaders", () => ({
  useRadarV2VolumeLeaders: (enabled: boolean) => {
    radarState.enabled = enabled;
    return {
      loading: radarState.loading,
      decision: radarState.decision,
      retry: () => {},
    };
  },
}));

const workspaceState: { data: PreMarketWorkspaceResponse | null } = { data: null };

vi.mock("@/hooks/usePreMarketWorkspace", () => ({
  usePreMarketWorkspace: () => ({
    data: workspaceState.data,
    isLoading: false,
    isFetching: false,
    isUnavailable: false,
    isStaleUpdateFailed: false,
    dataAsOf: workspaceState.data?.server_now ?? null,
    retry: () => {},
    isAuthenticated: true,
  }),
}));

vi.mock("@/components/pre-market/VolumeLeaderList", () => ({
  VolumeLeaderList: ({ rows }: { rows: Array<{ symbol: string }> }) => (
    <div data-testid="volume-leaders">{rows.map((r) => r.symbol).join(",")}</div>
  ),
}));

vi.mock("@/components/pre-market/SessionBanner", () => ({ SessionBanner: () => null }));
vi.mock("@/components/pre-market/IndexCards", () => ({ IndexCards: () => null }));
vi.mock("@/components/pre-market/CatalystWatchList", () => ({ CatalystWatchList: () => null }));
vi.mock("@/components/pre-market/EarningsList", () => ({ EarningsList: () => null }));
vi.mock("@/components/pre-market/WatchlistActivityList", () => ({
  WatchlistActivityList: () => null,
  WatchlistSessionCompact: () => null,
}));
vi.mock("@/components/pre-market/RiskAttentionList", () => ({ RiskAttentionList: () => null }));
vi.mock("@/components/pre-market/OpeningBellChecklist", () => ({ OpeningBellChecklist: () => null }));
vi.mock("@/components/pre-market/HeadlinesList", () => ({ HeadlinesList: () => null }));

import AMInbox from "@/pages/dashboard/AMInbox";

const SYNCED = "2026-09-04T11:12:30.000Z";

function section<T>(data: T) {
  return { status: "available" as const, data, as_of: SYNCED, reason_code: null };
}

function workspace(status: "premarket" | "regular"): PreMarketWorkspaceResponse {
  return {
    contract_version: 1,
    server_now: SYNCED,
    market_context: {
      status,
      et_date: "2026-09-04",
      et_time: "07:10",
      checked_at: SYNCED,
      source: "polygon_marketstatus",
      reason_code: null,
      official_open_at: null,
      official_close_at: null,
      next_known_session_at: null,
    },
    earnings_confirmed_total: 0,
    watchlist_lifecycle: [],
    alerts_included: true,
    indexes: section([]),
    watchlist_activity: section([]),
    risk_attention: section([]),
    catalyst_watch: section([]),
    earnings: section([]),
    volume_leaders: section([
      {
        symbol: "LEGACY",
        company_name: "Legacy Co",
        price: 10,
        change_percent: 5,
        volume: 100,
        rvol: 2,
        updated_at: SYNCED,
      },
    ]),
    journal_readiness: section({ open_trades: 0, missing_stop: 0, missing_target: 0, symbols: [] }),
    headlines: section([]),
    checklist: section([]),
  };
}

const radarAvailable: RadarV2Decision = {
  source: "radar-v2",
  reason: "radar_v2_available",
  session: "pre-market",
  view: {
    status: "available",
    synced_at: SYNCED,
    provider_as_of_max: SYNCED,
    rows: [
      {
        tab_id: "day_trade_radar",
        symbol: "IMRN",
        company_name: null,
        price: 4.2,
        change_percent: null,
        volume: 9_000_000,
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
        day_high: 5,
        day_low: 3,
        provider_as_of: SYNCED,
        sync_run_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        updated_at: SYNCED,
      },
      {
        tab_id: "day_trade_radar",
        symbol: "BAOS",
        company_name: null,
        price: 3.1,
        change_percent: null,
        volume: 4_000_000,
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
        day_high: 4,
        day_low: 2,
        provider_as_of: SYNCED,
        sync_run_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
        updated_at: SYNCED,
      },
    ],
  },
};

beforeEach(() => {
  radarState.enabled = false;
  radarState.decision = null;
  radarState.loading = false;
  workspaceState.data = null;
});

describe("AMInbox Pre-Market Volume Leaders wiring (D11)", () => {
  it("9. confirmed pre-market renders Radar V2 volume-first rows, not screener_results", () => {
    workspaceState.data = workspace("premarket");
    radarState.decision = radarAvailable;
    radarState.loading = false;

    render(
      <MemoryRouter>
        <AMInbox />
      </MemoryRouter>,
    );

    expect(radarState.enabled).toBe(true);
    expect(screen.getByText(RADAR_V2_PM_VOLUME_LEADERS_SUBTITLE)).toBeInTheDocument();
    expect(screen.queryByText(LEGACY_VOLUME_LEADERS_SUBTITLE)).not.toBeInTheDocument();
    expect(screen.getByTestId("volume-leaders").textContent).toBe("IMRN,BAOS");
    expect(screen.queryByText("LEGACY")).not.toBeInTheDocument();
  });

  it("12. regular session keeps the existing screener_results Volume Leaders path", () => {
    workspaceState.data = workspace("regular");
    radarState.decision = radarAvailable;
    radarState.loading = false;

    render(
      <MemoryRouter>
        <AMInbox />
      </MemoryRouter>,
    );

    expect(radarState.enabled).toBe(false);
    expect(screen.getByText(LEGACY_VOLUME_LEADERS_SUBTITLE)).toBeInTheDocument();
    expect(screen.queryByText(RADAR_V2_PM_VOLUME_LEADERS_SUBTITLE)).not.toBeInTheDocument();
    expect(screen.getByTestId("volume-leaders").textContent).toBe("LEGACY");
  });
});
