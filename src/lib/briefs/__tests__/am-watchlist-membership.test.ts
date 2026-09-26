import { describe, expect, it } from "vitest";
import { watchlistMembershipForSymbols } from "@/lib/briefs/am-watchlist-membership";

describe("AM brief watchlist membership hints", () => {
  it("marks symbols on the user watchlist", () => {
    const wl = new Set(["AAPL"]);
    expect(watchlistMembershipForSymbols(["AAPL", "TSLA"], wl)).toEqual([
      { symbol: "AAPL", on_user_watchlist: true },
      { symbol: "TSLA", on_user_watchlist: false },
    ]);
  });

  it("dedupes symbols case-insensitively", () => {
    const wl = new Set<string>();
    expect(watchlistMembershipForSymbols(["nvda", "NVDA"], wl)).toEqual([
      { symbol: "NVDA", on_user_watchlist: false },
    ]);
  });
});
