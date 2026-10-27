import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { buildLateSessionContinuationContext } from "@/lib/am-inbox/build-late-session-continuation-context";
import type { AmInboxLateSessionView } from "@/lib/am-inbox/late-session-continuation-types";

const AM_SESSION = "2026-10-27";

const handoffQueryState: {
  data: AmInboxLateSessionView | undefined;
  isLoading: boolean;
  isError: boolean;
  fetchStatus: "idle" | "fetching";
  refetch: ReturnType<typeof vi.fn>;
} = {
  data: undefined,
  isLoading: false,
  isError: false,
  fetchStatus: "idle",
  refetch: vi.fn(),
};

const workspaceState = {
  isUnavailable: false,
  data: null as null,
};

vi.mock("@/lib/am-inbox/resolve-am-inbox-session-date", () => ({
  resolveAmInboxSessionDate: () => AM_SESSION,
}));

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
  useRadarV2VolumeLeaders: () => ({
    loading: false,
    decision: null,
    retry: () => {},
    observe: { preserved: false, preserveReason: null, previousGenerationId: null, lastSuccessfulRefreshAt: null },
  }),
}));

vi.mock("@/hooks/usePreMarketWorkspace", () => ({
  usePreMarketWorkspace: () => ({
    data: workspaceState.data,
    isLoading: false,
    isFetching: false,
    isUnavailable: workspaceState.isUnavailable,
    isStaleUpdateFailed: false,
    dataAsOf: null,
    retry: () => {},
    isAuthenticated: true,
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
  useAmInboxLateSessionHandoffs: () => handoffQueryState,
}));

vi.mock("@/components/pre-market/SessionBanner", () => ({ SessionBanner: () => null }));
vi.mock("@/components/pre-market/IndexCards", () => ({ IndexCards: () => null }));
vi.mock("@/components/pre-market/CatalystWatchList", () => ({ CatalystWatchList: () => null }));
vi.mock("@/components/pre-market/EarningsList", () => ({ EarningsList: () => null }));
vi.mock("@/components/pre-market/WatchlistActivityList", () => ({
  WatchlistActivityList: () => null,
  WatchlistSessionCompact: () => null,
}));
vi.mock("@/components/pre-market/VolumeLeaderList", () => ({ VolumeLeaderList: () => null }));
vi.mock("@/components/pre-market/RiskAttentionList", () => ({ RiskAttentionList: () => null }));
vi.mock("@/components/pre-market/OpeningBellChecklist", () => ({ OpeningBellChecklist: () => null }));
vi.mock("@/components/pre-market/HeadlinesList", () => ({ HeadlinesList: () => null }));
vi.mock("@/components/pre-market/MorningOpportunityBoard", () => ({
  MorningOpportunityBoard: () => null,
}));

import AMInbox from "@/pages/dashboard/AMInbox";

function sampleView(): AmInboxLateSessionView {
  const context = buildLateSessionContinuationContext({
    symbol: "AAPL",
    sourceSessionDate: "2026-10-26",
    sourceTimestamp: "2026-10-26T20:00:00.000Z",
    sourceCategory: "POWER_HOUR_MOMENTUM",
    volume: 1_500_000,
    rvol: 2.4,
    rvolMetricKind: "rvol_20d",
    dollarVolume: 18_000_000,
  });
  const entry = {
    context,
    workflow: null,
    sourceCategories: ["POWER_HOUR_MOMENTUM"] as const,
  };
  return {
    asOfSessionDate: AM_SESSION,
    candidates: [entry],
    qualifiedCandidates: [entry],
    expiredCount: 0,
    funnel: {
      detectedCount: 1,
      qualifiedCount: 1,
      priorityCount: 1,
      displayedCount: 1,
      displayUsesQualifiedFallback: false,
    },
  };
}

function renderInbox() {
  return render(
    <MemoryRouter>
      <AMInbox />
    </MemoryRouter>,
  );
}

describe("AMInbox — late-session reliability (Batch 186.1)", () => {
  beforeEach(() => {
    workspaceState.isUnavailable = false;
    workspaceState.data = null;
    handoffQueryState.data = undefined;
    handoffQueryState.isLoading = false;
    handoffQueryState.isError = false;
    handoffQueryState.fetchStatus = "idle";
    handoffQueryState.refetch.mockReset();
  });

  it("retains continuation cards when a background refresh fails", () => {
    handoffQueryState.data = sampleView();
    handoffQueryState.isError = true;
    handoffQueryState.isLoading = false;
    handoffQueryState.fetchStatus = "idle";

    renderInbox();

    expect(screen.getByTestId("am-inbox-late-session-handoffs")).toBeInTheDocument();
    expect(screen.getByTestId("am-inbox-late-session-handoffs-refresh-warning")).toBeInTheDocument();
    expect(screen.queryByTestId("am-inbox-late-session-handoffs-error")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("am-inbox-late-session-handoffs")).getByText("AAPL")).toBeInTheDocument();
  });

  it("shows continuation when workspace fails but handoff RPC succeeded", () => {
    workspaceState.isUnavailable = true;
    handoffQueryState.data = sampleView();

    renderInbox();

    expect(screen.getByLabelText("Late-Session Continuation")).toBeInTheDocument();
    expect(screen.getByTestId("am-inbox-late-session-handoffs")).toBeInTheDocument();
    expect(screen.getAllByLabelText("Late-Session Continuation")).toHaveLength(1);
  });

  it("shows initial error when load fails with no prior view", () => {
    handoffQueryState.data = undefined;
    handoffQueryState.isError = true;

    renderInbox();

    expect(screen.getByTestId("am-inbox-late-session-handoffs-error")).toBeInTheDocument();
    expect(screen.queryByTestId("am-inbox-late-session-handoffs")).not.toBeInTheDocument();
  });
});
