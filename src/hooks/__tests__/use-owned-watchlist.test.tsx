import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOwnedWatchlist } from "../useOwnedWatchlist";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

function mockWatchlistQuery(rows: { symbol: string }[], delayMs = 0) {
  fromMock.mockReturnValue({
    select: () => ({
      eq: () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ data: rows }), delayMs);
        }),
    }),
  });
}

describe("useOwnedWatchlist", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("clears watchlist on the first render after switching users", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: (_column: string, value: string) => {
          if (value === "user-a") {
            return new Promise((resolve) => {
              setTimeout(() => resolve({ data: [{ symbol: "AAA" }] }), 50);
            });
          }
          return new Promise((resolve) => {
            setTimeout(() => resolve({ data: [{ symbol: "BBB" }] }), 10);
          });
        },
      }),
    });

    const view = renderHook(({ userId }: { userId: string | null }) => useOwnedWatchlist(userId), {
      initialProps: { userId: "user-a" as string | null },
    });

    act(() => {
      view.rerender({ userId: "user-b" });
    });

    expect(view.result.current.watchlist).toEqual([]);
    expect(view.result.current.watchlistOwnerId).toBe("user-b");

    await waitFor(() => {
      expect(view.result.current.watchlist).toEqual([{ symbol: "BBB" }]);
    });
  });

  it("ignores a late User A response after User B is active", async () => {
    let resolveA: (value: { data: { symbol: string }[] }) => void = () => {};
    const pendingA = new Promise<{ data: { symbol: string }[] }>((resolve) => {
      resolveA = resolve;
    });

    fromMock.mockImplementation(() => ({
      select: () => ({
        eq: (column: string, value: string) => {
          if (value === "user-a") return pendingA;
          return Promise.resolve({ data: [{ symbol: "BBB" }] });
        },
      }),
    }));

    const view = renderHook(({ userId }: { userId: string | null }) => useOwnedWatchlist(userId), {
      initialProps: { userId: "user-a" as string | null },
    });

    await act(async () => {
      view.rerender({ userId: "user-b" });
    });

    await waitFor(() => {
      expect(view.result.current.watchlist).toEqual([{ symbol: "BBB" }]);
    });

    await act(async () => {
      resolveA({ data: [{ symbol: "AAA" }] });
      await pendingA;
    });

    expect(view.result.current.watchlist).toEqual([{ symbol: "BBB" }]);
  });

  it("clears watchlist on logout", async () => {
    mockWatchlistQuery([{ symbol: "AAA" }]);
    const view = renderHook(({ userId }: { userId: string | null }) => useOwnedWatchlist(userId), {
      initialProps: { userId: "user-a" as string | null },
    });

    await waitFor(() => {
      expect(view.result.current.watchlist).toEqual([{ symbol: "AAA" }]);
    });

    await act(async () => {
      view.rerender({ userId: null });
    });

    expect(view.result.current.watchlist).toEqual([]);
    expect(view.result.current.watchlistOwnerId).toBeNull();
  });
});
