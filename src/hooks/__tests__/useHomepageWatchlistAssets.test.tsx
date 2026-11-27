import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useHomepageWatchlistAssets } from "@/hooks/useHomepageWatchlistAssets";
import {
  HOMEPAGE_WATCHLIST_PREVIEW_LIMIT,
  HOMEPAGE_WATCHLIST_QUOTES_QUERY_ROOT,
  WATCHLIST_V2_QUERY_ROOT,
  homepageWatchlistQuotesQueryKey,
  watchlistSymbolsQueryKey,
} from "@/lib/watchlist-v2/watchlist-query-isolation";
import { invalidateWatchlistClientCaches } from "@/lib/watchlist-v2/invalidate-watchlist-caches";

const { fromMock, authState } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  authState: { user: { id: "user-a" } as { id: string } | null },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: authState.user }),
}));

function chainable(result: { data?: unknown; error?: { message: string } | null }) {
  const terminal = Promise.resolve(result);
  const api: Record<string, unknown> = {
    then: terminal.then.bind(terminal),
    catch: terminal.catch.bind(terminal),
  };
  for (const method of ["select", "eq", "order", "limit", "in"] as const) {
    api[method] = () => api;
  }
  return api;
}

function mockTables(handlers: {
  watchlists?: { data?: unknown; error?: { message: string } | null };
  stocks?: { data?: unknown; error?: { message: string } | null };
}) {
  fromMock.mockImplementation((table: string) => {
    if (table === "watchlists") {
      return chainable(handlers.watchlists ?? { data: [], error: null });
    }
    if (table === "stocks") {
      return chainable(handlers.stocks ?? { data: [], error: null });
    }
    return chainable({ data: [], error: null });
  });
}

function wrapperFor(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("useHomepageWatchlistAssets", () => {
  beforeEach(() => {
    fromMock.mockReset();
    authState.user = { id: "user-a" };
  });

  it("loads authenticated watchlist symbols ordered by added_at preview bound", async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      id: `id-${i}`,
      symbol: `SYM${i}`,
      added_at: `2026-11-${String(27 - (i % 20)).padStart(2, "0")}T12:00:00Z`,
    }));
    mockTables({
      watchlists: { data: rows, error: null },
      stocks: {
        data: rows.slice(0, HOMEPAGE_WATCHLIST_PREVIEW_LIMIT).map((r) => ({
          symbol: r.symbol,
          name: `${r.symbol} Inc`,
          price: 10,
          change_percent: 1.5,
          updated_at: "2026-11-27T15:00:00Z",
        })),
        error: null,
      },
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useHomepageWatchlistAssets(), {
      wrapper: wrapperFor(qc),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toHaveLength(HOMEPAGE_WATCHLIST_PREVIEW_LIMIT);
    });

    expect(result.current.isError).toBe(false);
    expect(result.current.data[0]?.symbol).toBe("SYM0");
    expect(result.current.data[0]?.price).toBe(10);
    expect(fromMock).toHaveBeenCalledWith("watchlists");
  });

  it("keeps saved symbols when quote enrichment fails", async () => {
    mockTables({
      watchlists: {
        data: [
          { id: "1", symbol: "aapl", added_at: "2026-11-27T10:00:00Z" },
          { id: "2", symbol: "msft", added_at: "2026-11-26T10:00:00Z" },
        ],
        error: null,
      },
      stocks: { data: null, error: { message: "permission denied for table stocks" } },
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useHomepageWatchlistAssets(), {
      wrapper: wrapperFor(qc),
    });

    await waitFor(() => {
      expect(result.current.data.map((r) => r.symbol)).toEqual(["AAPL", "MSFT"]);
    });

    expect(result.current.isError).toBe(false);
    expect(result.current.data.every((r) => r.price === null)).toBe(true);
    await waitFor(() => {
      expect(result.current.quotesUnavailable).toBe(true);
    });
  });

  it("returns empty state for an empty watchlist", async () => {
    mockTables({ watchlists: { data: [], error: null } });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useHomepageWatchlistAssets(), {
      wrapper: wrapperFor(qc),
    });

    await waitFor(() => {
      expect(result.current.isEmpty).toBe(true);
    });
    expect(result.current.data).toEqual([]);
    expect(result.current.isError).toBe(false);
  });

  it("uses shared watchlist symbol keys and isolates users after logout/login", async () => {
    mockTables({
      watchlists: {
        data: [{ id: "1", symbol: "AAA", added_at: "2026-11-27T10:00:00Z" }],
        error: null,
      },
      stocks: {
        data: [{ symbol: "AAA", name: "AAA Co", price: 1, change_percent: 0, updated_at: null }],
        error: null,
      },
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    const { result, rerender } = renderHook(() => useHomepageWatchlistAssets(), {
      wrapper: wrapperFor(qc),
    });

    await waitFor(() => expect(result.current.data[0]?.symbol).toBe("AAA"));

    expect(qc.getQueryData(watchlistSymbolsQueryKey("user-a"))).toBeTruthy();
    expect(qc.getQueryData(homepageWatchlistQuotesQueryKey("user-a", ["AAA"]))).toBeTruthy();

    invalidateWatchlistClientCaches(qc, "user-a");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [WATCHLIST_V2_QUERY_ROOT] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: [HOMEPAGE_WATCHLIST_QUOTES_QUERY_ROOT] });

    authState.user = null;
    rerender();
    expect(result.current.data).toEqual([]);

    authState.user = { id: "user-b" };
    mockTables({
      watchlists: {
        data: [{ id: "9", symbol: "BBB", added_at: "2026-11-27T11:00:00Z" }],
        error: null,
      },
      stocks: {
        data: [{ symbol: "BBB", name: "BBB Co", price: 2, change_percent: 0, updated_at: null }],
        error: null,
      },
    });
    rerender();

    await waitFor(() => {
      expect(result.current.data.map((r) => r.symbol)).toEqual(["BBB"]);
    });
    expect(qc.getQueryData(watchlistSymbolsQueryKey("user-a"))).toBeTruthy();
    expect(result.current.data[0]?.symbol).not.toBe("AAA");
  });

  it("surfaces symbol retrieval failure without fabricating rows", async () => {
    fromMock.mockImplementation((table: string) => {
      if (table === "watchlists") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({
                data: null,
                error: { message: "column watchlists.created_at does not exist" },
              }),
            }),
          }),
        };
      }
      return chainable({ data: [], error: null });
    });

    const qc = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          // Hook sets retry: 2; zero delay keeps this assertion fast under vitest.
          retryDelay: 0,
        },
      },
    });
    const { result } = renderHook(() => useHomepageWatchlistAssets(), {
      wrapper: wrapperFor(qc),
    });

    await waitFor(
      () => {
        expect(result.current.isError).toBe(true);
      },
      { timeout: 5000 },
    );
    expect(result.current.data).toEqual([]);
  });
});
