import { describe, expect, it } from "vitest";
import { WATCHLIST_SNAPSHOT_STALE_MS } from "@/lib/market-data/trust-states";
import {
  watchlistIntradayRelievesStaleSnapshot,
  watchlistQuoteEvidenceMs,
} from "@/lib/watchlist-v2/watchlist-quote-coherence";

describe("watchlist quote coherence", () => {
  const now = Date.parse("2026-09-29T10:00:00.000Z");
  const sessionDate = "2026-09-29";

  it("relieves stale snapshot when session bars are fresh", () => {
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

  it("uses latest bar timestamp for evidence when newer than snapshot", () => {
    const snapshotMs = now - 30 * 60_000;
    const barMs = now - 2 * 60_000;
    expect(
      watchlistQuoteEvidenceMs({
        snapshotMs,
        intradayBars: [{ t: barMs }],
      }),
    ).toBe(barMs);
  });
});
