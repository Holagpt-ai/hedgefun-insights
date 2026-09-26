import { describe, expect, it } from "vitest";
import { deriveWatchlistMarketSignalSummary } from "@/lib/watchlist-v2/market-signal-summary";
import { parseInputsQuality, parseIntradayBars } from "@/lib/watchlist-v2/parsers";

describe("Watchlist V2 completion", () => {
  it("parses extended inputs_quality fields", () => {
    const q = parseInputsQuality({
      analysis_presentation: "last_completed",
      session_display_label: "Last completed session — Sep 25",
      market_signal_summary: { label: "MOMENTUM", rule_id: "participation_or_volume_momentum" },
      prior_session_volume: 1_000_000,
      vol_yday_ratio: 2.5,
      verified_recent_event: { kind: "radar", title: "MOMENTUM_TRIGGER", at: "2026-09-25T15:00:00Z" },
    });
    expect(q.analysis_presentation).toBe("last_completed");
    expect(q.market_signal_summary?.label).toBe("MOMENTUM");
    expect(q.prior_session_volume).toBe(1_000_000);
  });

  it("empty chart bars stay unavailable", () => {
    expect(parseIntradayBars([])).toEqual([]);
  });

  it("market signal rules — unavailable without price", () => {
    expect(
      deriveWatchlistMarketSignalSummary({
        direction: "data_unavailable",
        change_pct: null,
        price: null,
        rvol_class: null,
        signal_ids: [],
        participation_state: null,
      }).label,
    ).toBe("UNAVAILABLE");
  });

  it("market signal rules — momentum on surging participation", () => {
    expect(
      deriveWatchlistMarketSignalSummary({
        direction: "bullish",
        change_pct: 3,
        price: 10,
        rvol_class: "elevated",
        signal_ids: ["price_above_vwap"],
        participation_state: "SURGING",
      }).label,
    ).toBe("MOMENTUM");
  });

  it("market signal rules — bearish direction", () => {
    expect(
      deriveWatchlistMarketSignalSummary({
        direction: "bearish",
        change_pct: -2,
        price: 10,
        rvol_class: "normal",
        signal_ids: [],
        participation_state: null,
      }).label,
    ).toBe("BEARISH");
  });
});
