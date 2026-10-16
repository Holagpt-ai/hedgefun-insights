import { describe, expect, it } from "vitest";
import { WATCHLIST_SNAPSHOT_STALE_MS } from "@/lib/market-data/trust-states";
import { resolveWatchlistMarketDataTrust } from "@/lib/market-data/trust-states";
import {
  latestCoherentIntradayBarMs,
  watchlistIntradayRelievesStaleSnapshot,
  watchlistQuoteDisplayTimestampMs,
} from "@/lib/watchlist-v2/watchlist-quote-coherence";

describe("watchlist quote coherence", () => {
  const now = Date.parse("2026-09-29T10:00:00.000Z");
  const sessionDate = "2026-09-29";

  it("relieves stale snapshot when same-session bars are fresh", () => {
    const snapshotMs = now - WATCHLIST_SNAPSHOT_STALE_MS - 60_000;
    const bars = [{ t: now - 5 * 60_000 }];
    expect(
      watchlistIntradayRelievesStaleSnapshot({
        analysisPresentation: "live",
        analysisSessionDate: sessionDate,
        snapshotMs,
        intradayBars: bars,
        nowMs: now,
      }),
    ).toBe(true);
  });

  it("rejects future-dated bars", () => {
    const snapshotMs = now - WATCHLIST_SNAPSHOT_STALE_MS - 60_000;
    expect(
      latestCoherentIntradayBarMs({
        intradayBars: [{ t: now + 60_000 }],
        expectedSessionDate: sessionDate,
        snapshotMs,
        nowMs: now,
      }),
    ).toBeNull();
  });

  it("rejects bars from a different session than analysis", () => {
    const snapshotMs = Date.parse("2026-09-28T14:00:00.000Z");
    expect(
      watchlistIntradayRelievesStaleSnapshot({
        analysisPresentation: "live",
        analysisSessionDate: sessionDate,
        snapshotMs,
        intradayBars: [{ t: now - 5 * 60_000 }],
        nowMs: now,
      }),
    ).toBe(false);
  });

  it("does not relieve last_completed presentation", () => {
    const snapshotMs = now - WATCHLIST_SNAPSHOT_STALE_MS - 60_000;
    expect(
      watchlistIntradayRelievesStaleSnapshot({
        analysisPresentation: "last_completed",
        analysisSessionDate: sessionDate,
        snapshotMs,
        intradayBars: [{ t: now - 5 * 60_000 }],
        nowMs: now,
      }),
    ).toBe(false);
  });

  it("uses snapshot timestamp only for quote display labeling", () => {
    const snapshotMs = now - 30 * 60_000;
    expect(watchlistQuoteDisplayTimestampMs(snapshotMs)).toBe(snapshotMs);
  });

  it("closed-session presentation stays CLOSED without bar relief", () => {
    const friCloseEt = Date.parse("2026-09-25T20:00:00.000Z");
    const friLateNight = Date.parse("2026-09-26T02:00:00.000Z");
    expect(
      resolveWatchlistMarketDataTrust({
        hasV2: true,
        validThrough: new Date(friLateNight + 60 * 60_000).toISOString(),
        snapshotTsMs: friCloseEt,
        analysisPresentation: "live",
        analysisSessionDate: "2026-09-25",
        intradayBars: [{ t: friCloseEt - 5 * 60_000 }],
        nowMs: friLateNight,
      }),
    ).toBe("CLOSED");
  });
});
