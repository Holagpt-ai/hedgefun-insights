import { describe, expect, it } from "vitest";
import { resolveWatchlistLoadingState } from "@/lib/watchlist-v2/watchlist-loading-state";

describe("resolveWatchlistLoadingState", () => {
  it("keeps the list shimmer off while analysis and requests are still pending", () => {
    const state = resolveWatchlistLoadingState({
      hasUser: true,
      symbolsListPending: false,
      symbolsListFetched: true,
      symbolCount: 3,
      analysisPending: true,
      requestsPending: true,
    });
    expect(state.isListLoading).toBe(false);
    expect(state.isSecondaryLoading).toBe(true);
    expect(state.isLoading).toBe(false);
  });

  it("does not block the list on secondary queries when symbols are not loaded yet", () => {
    const state = resolveWatchlistLoadingState({
      hasUser: true,
      symbolsListPending: true,
      symbolsListFetched: false,
      symbolCount: 0,
      analysisPending: false,
      requestsPending: false,
    });
    expect(state.isListLoading).toBe(true);
    expect(state.isSecondaryLoading).toBe(false);
  });

  it("leaves logged-out callers idle", () => {
    const state = resolveWatchlistLoadingState({
      hasUser: false,
      symbolsListPending: true,
      symbolsListFetched: false,
      symbolCount: 0,
      analysisPending: true,
      requestsPending: true,
    });
    expect(state).toEqual({
      isListLoading: false,
      isSecondaryLoading: false,
      isLoading: false,
    });
  });

  it("allows an error banner path when analysis failed but symbols fetched", () => {
    const state = resolveWatchlistLoadingState({
      hasUser: true,
      symbolsListPending: false,
      symbolsListFetched: true,
      symbolCount: 2,
      analysisPending: false,
      requestsPending: false,
    });
    expect(state.isListLoading).toBe(false);
  });
});
