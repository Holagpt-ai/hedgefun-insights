import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildScannerAlertCopy } from "./build-alert-copy.ts";
import { scannerAlertDedupeKey as dedupe } from "./dedupe-key.ts";
import type { ScannerAlertFiring } from "./types.ts";

const firing: ScannerAlertFiring = {
  symbol: "JAGX",
  event_type: "RUNNING_UP",
  event_at: "2026-08-02T14:05:00.000Z",
  trading_date: "2026-08-02",
  session_kind: "market",
  price: 4.2,
  move_pct: 12,
  today_volume: 10_200_000,
  prior_volume: 500_000,
  vol_prior: 20.4,
  rvol_5m: 8.4,
  volume_velocity: 182_000,
  volume_acceleration_pct: 74,
  distance_from_hod_pct: 2,
  session_vwap: 4.1,
};

Deno.test("dedupe key is stable per symbol/type/triggered_at", () => {
  assertEquals(
    dedupe({
      trading_date: "2026-08-02",
      symbol: "jagx",
      event_type: "RUNNING_UP",
      event_at: "2026-08-02T14:05:00.000Z",
    }),
    "scanner_v1:2026-08-02:JAGX:RUNNING_UP:2026-08-02T14:05:00.000Z",
  );
});

Deno.test("alert copy uses context not prediction language", () => {
  const { headline, summary } = buildScannerAlertCopy({
    firing,
    repeatMoverLabel: "Repeat mover · 4 similar episodes",
    lastEpisodeDate: "2025-08-02",
    comparableCount: 4,
    catalystLabel: "Stock Split",
  });
  assertEquals(headline, "JAGX — RUNNING UP");
  assertEquals(summary.includes("8.4x 5m RVOL"), true);
  assertEquals(summary.includes("Stock Split"), true);
  assertEquals(summary.includes("No verified catalyst"), false);
  assertEquals(/will run|likely to explode|buy now/i.test(summary), false);
});

Deno.test("no history and no catalyst remain valid copy", () => {
  const { summary } = buildScannerAlertCopy({
    firing,
    repeatMoverLabel: null,
    lastEpisodeDate: null,
    comparableCount: null,
    catalystLabel: null,
  });
  assertEquals(summary.includes("No verified catalyst"), true);
});
