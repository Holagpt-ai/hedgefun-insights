import { describe, it, expect } from "vitest";
import {
  compactWatchlistNotice,
  isActivePremarketSession,
  watchlistTrackedCount,
} from "@/lib/session-intelligence/watchlist-session";

describe("watchlist session-aware presentation", () => {
  it("keeps full rows during a confirmed pre-market session", () => {
    expect(isActivePremarketSession("premarket")).toBe(true);
    expect(compactWatchlistNotice("premarket", 15)).toBeNull();
  });

  it("compresses regular session instead of listing awaiting-refresh chips", () => {
    const notice = compactWatchlistNotice("regular", 15);
    expect(notice?.compact).toBe(true);
    expect(notice?.headline).toBe("Pre-market session has ended.");
    expect(notice?.detail).toBe("15 Watchlist symbols tracked.");
  });

  it("compresses after-hours the same way", () => {
    const notice = compactWatchlistNotice("afterhours", 4);
    expect(notice?.headline).toBe("Pre-market session has ended.");
    expect(notice?.detail).toBe("4 Watchlist symbols tracked.");
  });

  it("compresses closed market", () => {
    const notice = compactWatchlistNotice("closed", 1);
    expect(notice?.headline).toBe("Pre-market session has ended.");
    expect(notice?.detail).toBe("1 Watchlist symbol tracked.");
  });

  it("uses a distinct non-trading-day headline", () => {
    const notice = compactWatchlistNotice("non_trading_day", 8);
    expect(notice?.headline).toBe("No Pre-Market session today.");
    expect(notice?.detail).toBe("8 Watchlist symbols tracked.");
  });

  it("counts unique activity + lifecycle tickers", () => {
    expect(watchlistTrackedCount(["AAPL", "MSFT"], ["MSFT", "NVDA"])).toBe(3);
    expect(watchlistTrackedCount([], [])).toBe(0);
  });
});
