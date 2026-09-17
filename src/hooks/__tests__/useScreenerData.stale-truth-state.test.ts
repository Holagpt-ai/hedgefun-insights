import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { SCREENER_STALE_AFTER_MS } from "@/lib/screeners/contract";

const { fetchScreenerFeedStateMock, supabaseFromMock } = vi.hoisted(() => ({
  fetchScreenerFeedStateMock: vi.fn(),
  supabaseFromMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: supabaseFromMock,
  },
}));

vi.mock("@/lib/screeners/screener-feed-fetch", () => ({
  fetchScreenerFeedState: fetchScreenerFeedStateMock,
}));

vi.mock("@/lib/screeners/radar-v2-adapter", () => ({
  isRadarV2BackedTab: () => false,
}));

import { useScreenerData } from "@/hooks/useScreenerData";

const SYNCED = "2026-09-14T20:35:00.000Z";
const RUN_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function feedState(overrides: Record<string, unknown> = {}) {
  return {
    state_key: "current",
    sync_run_id: RUN_ID,
    status: "available",
    synced_at: SYNCED,
    provider_as_of_min: SYNCED,
    provider_as_of_max: SYNCED,
    rows_inserted: 1,
    tab_counts: {
      day_trade_radar: 0,
      gappers: 1,
      volume_spikes: 0,
      gainers_losers: 0,
      unusual_volume: 0,
      new_highs_lows: 0,
    },
    nhl_baseline_status: "available",
    tab_evaluation_evidence: null,
    updated_at: SYNCED,
    ...overrides,
  };
}

function gapperRow() {
  return {
    tab_id: "gappers",
    symbol: "GAP1",
    company_name: "GAP1",
    price: 10,
    change_percent: null,
    volume: 1_000_000,
    avg_volume: null,
    rvol: null,
    avg_volume_20d: null,
    rvol_20d: null,
    float_shares: null,
    gap_percent: 6,
    high_52w: null,
    low_52w: null,
    range_event: null,
    market_cap: null,
    prior_session_volume: null,
    volume_ratio_prior_session: null,
    day_high: 10.5,
    day_low: 9.5,
    provider_as_of: SYNCED,
    sync_run_id: RUN_ID,
    updated_at: SYNCED,
  };
}

describe("useScreenerData stale truth-state transition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse(SYNCED));
    fetchScreenerFeedStateMock.mockReset();
    supabaseFromMock.mockReset();
    supabaseFromMock.mockReturnValue({
      select: () => ({
        in: () => ({
          order: () => ({
            order: () => ({
              order: () => ({
                limit: async () => ({ data: [gapperRow()], error: null }),
              }),
            }),
          }),
        }),
      }),
    });
    fetchScreenerFeedStateMock.mockResolvedValue({
      stateRows: [feedState()],
      stateError: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions status and truthState to generation_stale together", async () => {
    const { result } = renderHook(() => useScreenerData("gappers"));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe("available");
    expect(result.current.truthState?.reason).toBe("evaluated_with_results");
    expect(result.current.truthState?.showRows).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(SCREENER_STALE_AFTER_MS + 1);
    });

    expect(result.current.status).toBe("stale");
    expect(result.current.truthState?.reason).toBe("generation_stale");
    expect(result.current.truthState?.showRows).toBe(true);
    expect(result.current.truthState?.showFreshness).toBe(true);
    expect(result.current.rows).toHaveLength(1);
  });

  it("empty generation stale keeps rows hidden with generation_stale reason", async () => {
    fetchScreenerFeedStateMock.mockResolvedValue({
      stateRows: [
        feedState({
          status: "empty",
          rows_inserted: 0,
          provider_as_of_min: null,
          provider_as_of_max: null,
          tab_counts: {
            day_trade_radar: 0,
            gappers: 0,
            volume_spikes: 0,
            gainers_losers: 0,
            unusual_volume: 0,
            new_highs_lows: 0,
          },
          tab_evaluation_evidence: {
            gappers: {
              status: "evaluated",
              universe_count: 100,
              volume_positive_count: 95,
              gap_calculable_count: 95,
              no_prior_session_count: 0,
              unresolved_gap_input_count: 0,
              qualified_count: 0,
              selected_count: 0,
            },
          },
        }),
      ],
      stateError: null,
    });
    supabaseFromMock.mockReturnValue({
      select: () => ({
        in: () => ({
          order: () => ({
            order: () => ({
              order: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    });

    const { result } = renderHook(() => useScreenerData("gappers"));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe("empty");
    expect(result.current.truthState?.reason).toBe("validated_zero_matches");

    await act(async () => {
      vi.advanceTimersByTime(SCREENER_STALE_AFTER_MS + 1);
    });

    expect(result.current.status).toBe("stale");
    expect(result.current.truthState?.reason).toBe("generation_stale");
    expect(result.current.truthState?.showRows).toBe(false);
  });
});
