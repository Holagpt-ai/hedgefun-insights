import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AsyncTimeoutError } from "@/lib/async/with-timeout";
import type { PreMarketWorkspaceResponse } from "@/types/pre-market";

const invoke = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

import {
  fetchPreMarketWorkspace,
  PRE_MARKET_WORKSPACE_FETCH_TIMEOUT_MS,
  shouldRetryPreMarketWorkspace,
  usePreMarketWorkspace,
} from "@/hooks/usePreMarketWorkspace";

function wrapper(client: QueryClient) {
  return function W({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function minimalWorkspacePayload(): PreMarketWorkspaceResponse {
  const section = <T,>(data: T) => ({
    status: "available" as const,
    data,
    as_of: null,
    reason_code: null,
  });
  return {
    contract_version: 1,
    server_now: "2026-11-12T14:00:00.000Z",
    market_context: {
      status: "premarket",
      et_date: "2026-11-12",
      et_time: "09:00",
      checked_at: "2026-11-12T14:00:00.000Z",
      source: "polygon_marketstatus",
      reason_code: null,
      official_open_at: null,
      official_close_at: null,
      next_known_session_at: null,
    },
    earnings_calendar_fetch_limit: 320,
    earnings_calendar_source_truncated: false,
    watchlist_lifecycle: [],
    alerts_included: true,
    indexes: section([]),
    watchlist_activity: section([]),
    risk_attention: section([]),
    catalyst_watch: section([]),
    earnings: section([]),
    earnings_timing_unconfirmed: section([]),
    earnings_timing_unconfirmed_total: 0,
    earnings_confirmed_total: 0,
    volume_leaders: section([]),
    journal_readiness: section({
      open_trades: 0,
      missing_stop: 0,
      missing_target: 0,
      symbols: [],
    }),
    headlines: section([]),
    checklist: section([]),
  };
}

describe("shouldRetryPreMarketWorkspace", () => {
  it("does not retry AsyncTimeoutError", () => {
    expect(
      shouldRetryPreMarketWorkspace(0, new AsyncTimeoutError("get-pre-market-workspace", 25_000)),
    ).toBe(false);
  });

  it("retries transient errors once", () => {
    expect(shouldRetryPreMarketWorkspace(0, new Error("WORKSPACE_UNAVAILABLE"))).toBe(true);
    expect(shouldRetryPreMarketWorkspace(1, new Error("WORKSPACE_UNAVAILABLE"))).toBe(false);
  });
});

describe("fetchPreMarketWorkspace", () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects with AsyncTimeoutError when Edge invoke never settles", async () => {
    invoke.mockImplementation(() => new Promise(() => {}));
    const client = new QueryClient();
    const key = ["pre-market-workspace", "user-1"] as const;
    vi.useFakeTimers();
    try {
      const pending = fetchPreMarketWorkspace(client, key);
      const assertion = expect(pending).rejects.toBeInstanceOf(AsyncTimeoutError);
      await vi.advanceTimersByTimeAsync(PRE_MARKET_WORKSPACE_FETCH_TIMEOUT_MS + 50);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("usePreMarketWorkspace", () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("terminates initial loading with isUnavailable after workspace failure", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "fail" } });
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { result } = renderHook(() => usePreMarketWorkspace(), {
      wrapper: wrapper(client),
    });
    await waitFor(
      () => {
        expect(result.current.isUnavailable).toBe(true);
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: 8_000 },
    );
  });

  it(
    "reaches isUnavailable after one timeout without a second stalled invoke",
    async () => {
      invoke.mockImplementation(() => new Promise(() => {}));
      const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
      const { result } = renderHook(() => usePreMarketWorkspace(), {
        wrapper: wrapper(client),
      });
      await waitFor(
        () => {
          expect(result.current.isUnavailable).toBe(true);
          expect(result.current.isLoading).toBe(false);
        },
        { timeout: PRE_MARKET_WORKSPACE_FETCH_TIMEOUT_MS + 3_000 },
      );
      expect(invoke).toHaveBeenCalledTimes(1);
    },
    PRE_MARKET_WORKSPACE_FETCH_TIMEOUT_MS + 8_000,
  );

  it("retries once after a transient Edge error then succeeds", async () => {
    const payload = minimalWorkspacePayload();
    invoke
      .mockResolvedValueOnce({ data: null, error: { message: "fail" } })
      .mockResolvedValueOnce({ data: payload, error: null });
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    const { result } = renderHook(() => usePreMarketWorkspace(), {
      wrapper: wrapper(client),
    });
    await waitFor(
      () => {
        expect(result.current.data?.server_now).toBe(payload.server_now);
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: 8_000 },
    );
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("keeps prior workspace visible when a refresh fails", async () => {
    const payload = minimalWorkspacePayload();
    invoke
      .mockResolvedValueOnce({ data: payload, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "fail" } });
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    const { result } = renderHook(() => usePreMarketWorkspace(), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.dataAsOf).toBe(payload.server_now));
    const priorAsOf = result.current.dataAsOf;
    result.current.retry();
    await waitFor(
      () => {
        expect(result.current.isStaleUpdateFailed).toBe(true);
        expect(result.current.dataAsOf).toBe(priorAsOf);
        expect(result.current.isLoading).toBe(false);
      },
      { timeout: 8_000 },
    );
  });
});
