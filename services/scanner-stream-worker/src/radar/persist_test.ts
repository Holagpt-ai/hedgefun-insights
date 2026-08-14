import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  publishRadarGeneration,
  type RadarRpcFn,
  type ReplaceRadarArgs,
  validateRadarGeneration,
} from "./persist.ts";
import type { RadarV22BoardRow } from "../../../../supabase/functions/_shared/radar-v22/types.ts";

const GEN = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function row(rank: number, symbol: string): RadarV22BoardRow {
  return {
    generation_id: GEN,
    rank,
    symbol,
    company_name: symbol,
    lifecycle: "ACTIVE",
    signal_status: "EXPLOSIVE",
    price: 10,
    change_percent: 12,
    volume: 1000,
    prior_session_volume: 100,
    volume_ratio_prior_session: 10,
    day_high: 11,
    day_low: 9,
    rolling_volume_5s: 10,
    rolling_volume_15s: 20,
    rolling_volume_60s: 100_000,
    rolling_dollar_volume_60s: 1_000_000,
    acceleration_5m: null,
    session_vwap: 10,
    peak_volume_15s: 20,
    provider_as_of: "2026-08-10T14:00:01.000Z",
    updated_at: "2026-08-10T14:00:05.000Z",
  };
}

Deno.test("atomic publication sends one RPC with one generation id", async () => {
  const calls: ReplaceRadarArgs[] = [];
  const rpc: RadarRpcFn = async (args) => {
    calls.push(args);
    return { error: null };
  };
  const published = await publishRadarGeneration(rpc, {
    p_generation_id: GEN,
    p_rows: [row(1, "AAA"), row(2, "BBB")],
    p_archive: [],
    p_session_date: "2026-08-10",
    p_synced_at: "2026-08-10T14:00:05.000Z",
    p_status: "available",
    p_last_provider_event_at: "2026-08-10T14:00:01.000Z",
  });
  assertEquals(published.ok, true);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].p_generation_id, GEN);
  assertEquals(calls[0].p_rows.map((r) => r.symbol), ["AAA", "BBB"]);
});

Deno.test("atomic publication does not call RPC when validation fails", async () => {
  const calls: ReplaceRadarArgs[] = [];
  const rpc: RadarRpcFn = async (args) => {
    calls.push(args);
    return { error: null };
  };
  const published = await publishRadarGeneration(rpc, {
    p_generation_id: GEN,
    p_rows: [row(1, "AAA"), row(1, "BBB")],
    p_archive: [],
    p_session_date: "2026-08-10",
    p_synced_at: "2026-08-10T14:00:05.000Z",
    p_status: "available",
    p_last_provider_event_at: null,
  });
  assertEquals(published.ok, false);
  assertEquals(calls.length, 0);
  assertEquals(
    validateRadarGeneration(
      [row(1, "AAA"), row(1, "BBB")],
      GEN,
      "2026-08-10",
      "2026-08-10T14:00:05.000Z",
      "available",
    ),
    false,
  );
});
