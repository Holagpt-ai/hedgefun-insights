import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidateWatchlistClientCaches } from "@/lib/watchlist-v2/invalidate-watchlist-caches";
import { WATCHLIST_V2_QUERY_ROOT } from "@/lib/watchlist-v2/watchlist-query-isolation";

describe("batch232 invalidateWatchlistClientCaches", () => {
  it("invalidates legacy watchlist keys and the full watchlist-v2 tree", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    invalidateWatchlistClientCaches(qc, "user-abc");

    expect(spy).toHaveBeenCalledWith({ queryKey: ["watchlist"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["watchlist", "user-abc"] });
    expect(spy).toHaveBeenCalledWith({ queryKey: [WATCHLIST_V2_QUERY_ROOT] });
  });

  it("skips user-scoped legacy key when userId is absent", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");

    invalidateWatchlistClientCaches(qc, null);

    expect(spy).toHaveBeenCalledWith({ queryKey: ["watchlist"] });
    expect(spy).not.toHaveBeenCalledWith({ queryKey: ["watchlist", null] });
    expect(spy).toHaveBeenCalledWith({ queryKey: [WATCHLIST_V2_QUERY_ROOT] });
  });
});
