import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PreMarketWorkspaceResponse } from "@/types/pre-market";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ profile: { plan: "pro" }, user: { id: "u1" } }),
}));

vi.mock("@/hooks/usePageSeo", () => ({ usePageSeo: () => {} }));
vi.mock("@/components/dashboard/AIBriefCard", () => ({ AIBriefCard: () => null }));
vi.mock("@/hooks/useRadarV2VolumeLeaders", () => ({
  useRadarV2VolumeLeaders: () => ({
    loading: false,
    decision: null,
    retry: () => {},
    observe: { preserved: false, preserveReason: null, previousGenerationId: null, lastSuccessfulRefreshAt: null },
  }),
}));
vi.mock("@/hooks/useCatalystPlatformContextForSymbols", () => ({
  useCatalystPlatformContextForSymbols: () => ({
    platformBySymbol: new Map(),
    enrichmentPending: false,
    isError: false,
  }),
}));
vi.mock("@/hooks/useAmInboxLateSessionHandoffs", () => ({
  useAmInboxLateSessionHandoffs: () => ({
    data: undefined,
    isLoading: false,
    isError: false,
    fetchStatus: "idle",
    refetch: vi.fn(),
  }),
}));

vi.mock("@/components/pre-market/LateSessionHandoffsList", () => ({ LateSessionHandoffsList: () => null }));
vi.mock("@/components/pre-market/MorningOpportunityBoard", () => ({ MorningOpportunityBoard: () => null }));
vi.mock("@/components/pre-market/SessionBanner", () => ({ SessionBanner: () => null }));
vi.mock("@/components/pre-market/IndexCards", () => ({ IndexCards: () => null }));
vi.mock("@/components/pre-market/CatalystWatchList", () => ({ CatalystWatchList: () => null }));
vi.mock("@/components/pre-market/EarningsList", () => ({ EarningsList: () => <div data-testid="earnings-list" /> }));
vi.mock("@/components/pre-market/WatchlistActivityList", () => ({
  WatchlistActivityList: () => null,
  WatchlistSessionCompact: () => null,
}));
vi.mock("@/components/pre-market/VolumeLeaderList", () => ({ VolumeLeaderList: () => null }));
vi.mock("@/components/pre-market/RiskAttentionList", () => ({ RiskAttentionList: () => null }));
vi.mock("@/components/pre-market/OpeningBellChecklist", () => ({ OpeningBellChecklist: () => null }));
vi.mock("@/components/pre-market/HeadlinesList", () => ({ HeadlinesList: () => null }));

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

import AMInbox from "@/pages/dashboard/AMInbox";

function earnSection() {
  return {
    status: "available" as const,
    data: [{
      id: "e1",
      symbol: "SOFI",
      company_name: "SoFi",
      provider: "earnings_calendar",
      verification_state: "provider_reported",
      event_type: "earnings",
      event_date: "2026-10-27",
      time_of_day: "before_open" as const,
      title: "SoFi Technologies, Inc. — Earnings",
      estimate_eps: 0.05,
      actual_eps: 0.08,
      surprise_percent: 60,
      source_name: "Earnings Calendar",
      source_url: null,
      updated_at: "2026-10-27T08:00:00.000Z",
      published_at: null,
      release_state: "reported" as const,
      priority_reason: "Earnings surprise",
    }],
    as_of: "2026-10-27T08:00:00.000Z",
    reason_code: null,
  };
}

function section<T>(data: T) {
  return { status: "available" as const, data, as_of: "2026-10-27T08:00:00.000Z", reason_code: null };
}

function minimalWorkspace(truncated: boolean): PreMarketWorkspaceResponse {
  const empty = { status: "empty" as const, data: [], as_of: null, reason_code: "NO_QUALIFYING_DATA" };
  return {
    contract_version: 1,
    server_now: "2026-10-27T13:00:00.000Z",
    earnings_confirmed_total: 65,
    earnings_timing_unconfirmed_total: 0,
    earnings_calendar_fetch_limit: 320,
    earnings_calendar_source_truncated: truncated,
    watchlist_lifecycle: [],
    alerts_included: true,
    market_context: {
      status: "premarket",
      et_date: "2026-10-27",
      et_time: "09:00",
      checked_at: "2026-10-27T13:00:00.000Z",
      source: "polygon_marketstatus",
      reason_code: null,
      official_open_at: null,
      official_close_at: null,
      next_known_session_at: null,
    },
    indexes: empty,
    watchlist_activity: empty,
    risk_attention: empty,
    catalyst_watch: empty,
    earnings: earnSection(),
    earnings_timing_unconfirmed: empty,
    volume_leaders: empty,
    journal_readiness: section({ open_trades: 0, missing_stop: 0, missing_target: 0, symbols: [] }),
    headlines: empty,
    checklist: section([]),
  };
}

describe("AMInbox — earnings calendar truncation disclosure", () => {
  it("shows a warning when the calendar source fetch hit its limit", () => {
    workspaceState.data = minimalWorkspace(true);
    render(
      <MemoryRouter>
        <AMInbox />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("am-inbox-earnings-calendar-truncated-warning")).toBeInTheDocument();
    expect(screen.getByTestId("earnings-list")).toBeInTheDocument();
  });

  it("hides the warning when the calendar source was not truncated", () => {
    workspaceState.data = minimalWorkspace(false);
    render(
      <MemoryRouter>
        <AMInbox />
      </MemoryRouter>,
    );
    expect(screen.queryByTestId("am-inbox-earnings-calendar-truncated-warning")).not.toBeInTheDocument();
  });
});
