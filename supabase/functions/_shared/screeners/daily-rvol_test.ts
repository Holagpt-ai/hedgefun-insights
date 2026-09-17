import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  RVOL_20D_SESSION_COUNT,
  averageFullDayVolume20d,
  computeDailyRvol20d,
} from "./daily-rvol.ts";

Deno.test("daily RVOL 20D requires exactly twenty valid sessions", () => {
  const sessions = Array.from({ length: RVOL_20D_SESSION_COUNT }, () => 2_000_000);
  assertEquals(averageFullDayVolume20d(sessions), 2_000_000);
  assertEquals(averageFullDayVolume20d(sessions.slice(0, 19)), null);
  assertEquals(computeDailyRvol20d(10_000_000, 2_000_000), 5);
});
