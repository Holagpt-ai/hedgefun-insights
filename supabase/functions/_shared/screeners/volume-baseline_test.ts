import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isVolumeBaselineValidForTradingDate,
  rvol20dFromBaseline,
} from "./volume-baseline.ts";

Deno.test("volume baseline rejects self-inclusive window", () => {
  const quote = {
    symbol: "AAA",
    avg_volume_20d: 2_000_000,
    volume_sessions_used: 20,
    window_start_date: "2026-08-01",
    window_end_date: "2026-08-28",
  };
  assertEquals(isVolumeBaselineValidForTradingDate(quote, "2026-08-28"), false);
  assertEquals(
    rvol20dFromBaseline(10_000_000, quote, "2026-08-28"),
    { avg_volume_20d: null, rvol_20d: null },
  );
  assertEquals(rvol20dFromBaseline(10_000_000, quote, "2026-08-29").rvol_20d, 5);
});
