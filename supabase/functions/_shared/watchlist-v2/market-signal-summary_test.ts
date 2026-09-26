import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deriveWatchlistMarketSignalSummary } from "./market-signal-summary.ts";

Deno.test("market signal unavailable without price", () => {
  const s = deriveWatchlistMarketSignalSummary({
    direction: "data_unavailable",
    change_pct: null,
    price: null,
    rvol_class: null,
    market_signals: [],
    radar_context: null,
  });
  assertEquals(s.label, "UNAVAILABLE");
});

Deno.test("market signal momentum on surging participation", () => {
  const s = deriveWatchlistMarketSignalSummary({
    direction: "bullish",
    change_pct: 4,
    price: 12,
    rvol_class: "elevated",
    market_signals: [],
    radar_context: {
      primary_event: null,
      primary_event_at: null,
      promotion_primary_event: null,
      promotion_trigger_at: null,
      radar_event_lifecycle: null,
      rvol_5m: null,
      volume_velocity: null,
      volume_acceleration_pct: null,
      distance_from_hod_pct: null,
      participation: {
        time_adjusted_rvol: 2.1,
        volume_5m: 100,
        volume_15m: null,
        volume_60m: null,
        volume_velocity_5m: null,
        volume_velocity_15m: null,
        volume_velocity_60m: null,
        dollar_volume_velocity_5m: null,
        participation_state: "SURGING",
        baseline_session_count: 10,
      },
    },
  });
  assertEquals(s.label, "MOMENTUM");
});
