import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWatchlistSymbolRows } from "@/lib/watchlist-v2/fetch-watchlist-symbols";

const { fromMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

describe("fetchWatchlistSymbolRows", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("selects id/symbol/added_at and orders by added_at", async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        { id: "2", symbol: "bbb", added_at: "2026-11-27T12:00:00Z" },
        { id: "1", symbol: "aaa", added_at: "2026-11-26T12:00:00Z" },
      ],
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ order });
    const select = vi.fn().mockReturnValue({ eq });
    fromMock.mockReturnValue({ select });

    const rows = await fetchWatchlistSymbolRows("user-1");

    expect(fromMock).toHaveBeenCalledWith("watchlists");
    expect(select).toHaveBeenCalledWith("id, symbol, added_at");
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(order).toHaveBeenCalledWith("added_at", { ascending: false });
    expect(rows.map((r) => r.symbol)).toEqual(["BBB", "AAA"]);
  });

  it("throws when the watchlists query fails", async () => {
    fromMock.mockReturnValue({
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: null,
            error: { message: "column watchlists.created_at does not exist" },
          }),
        }),
      }),
    });

    await expect(fetchWatchlistSymbolRows("user-1")).rejects.toMatchObject({
      message: "column watchlists.created_at does not exist",
    });
  });
});
