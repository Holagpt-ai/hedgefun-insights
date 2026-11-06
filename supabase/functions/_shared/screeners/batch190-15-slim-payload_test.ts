import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  jobFromControl,
  type StagingJobControl,
} from "./sync-staging-serialize.ts";
import {
  selectGainersLosersFromUniverse,
  selectGainersLosersRanked,
  type PolygonTicker,
} from "./selection.ts";

function mover(symbol: string, close: number, volume: number): PolygonTicker {
  return {
    ticker: symbol,
    updated: Date.parse("2026-10-28T16:45:00.000Z") * 1_000_000,
    day: { c: close, o: 10, v: volume, h: close, l: 9 },
    prevDay: { c: 10, v: 1_000 },
  };
}

Deno.test("Batch 190.15: control job carries CAS fields and no universe arrays", () => {
  const control: StagingJobControl = {
    id: "11111111-1111-1111-1111-111111111111",
    status: "finalizing",
    state_version: 4,
    next_chunk_index: 7,
    total_chunks: 7,
    chunk_size: 2200,
    sync_run_id: "22222222-2222-2222-2222-222222222222",
    publish_rows_inserted: 12,
    publish_rpc_recorded_at: "2026-11-04T20:00:00.000Z",
    finalize_lease_token: "33333333-3333-3333-3333-333333333333",
    finalize_lease_expires_at: "2026-11-04T20:12:00.000Z",
    lease_token: null,
    lease_expires_at: null,
  };
  const job = jobFromControl(control);
  assertEquals(job.stateVersion, 4);
  assertEquals(job.publishRowsInserted, 12);
  assertEquals(job.nextChunkIndex, 7);
  assertEquals(job.allTickers.length, 0);
  assertEquals(job.nhlBaselineSnapshot, null);
  const encoded = JSON.stringify(control);
  assertEquals(encoded.includes("all_tickers"), false);
  assertEquals(encoded.includes("merged_artifacts"), false);
});

Deno.test("Batch 190.15: representative control payload stays far below full job JSON", () => {
  const tickers = Array.from({ length: 13_262 }, (_, i) => ({
    ticker: `T${String(i).padStart(5, "0")}`,
    updated: 1,
    day: { c: 10, o: 10, v: 100_000, h: 11, l: 9 },
    prevDay: { c: 9.5, v: 50_000 },
    min: { av: 100_000, v: 1_000, t: 1 },
  }));
  const full = {
    ok: true,
    job: {
      id: "job",
      status: "finalizing",
      all_tickers: tickers,
      gainers: tickers.slice(0, 50),
      losers: tickers.slice(0, 50),
      merged_artifacts: { note: "x".repeat(399_000) },
      nhl_baseline_snapshot: { quoteEntries: tickers.slice(0, 800) },
      state_version: 8,
    },
  };
  const control = {
    ok: true,
    rows_inserted: 60,
    control: {
      id: "job",
      status: "finalizing",
      state_version: 9,
      next_chunk_index: 7,
      total_chunks: 7,
      chunk_size: 2200,
      sync_run_id: "sync",
      publish_rows_inserted: 60,
      publish_rpc_recorded_at: null,
      finalize_lease_token: "lease",
      finalize_lease_expires_at: null,
      lease_token: null,
      lease_expires_at: null,
    },
  };
  const fullBytes = JSON.stringify(full).length;
  const controlBytes = JSON.stringify(control).length;
  console.log(
    `[batch190-15-payload] ${JSON.stringify({
      full_job_response_bytes: fullBytes,
      control_response_bytes: controlBytes,
      note: "local_json_bytes_not_edge_cpu",
    })}`,
  );
  assertEquals(fullBytes > 1_000_000, true);
  assertEquals(controlBytes < 2_000, true);
});

Deno.test("Batch 190.15: chunk top-20 is not duplicate-safe, so finalize keeps full-universe rank", () => {
  const strong = mover("AAA", 20, 5_000_000);
  const weak = mover("AAA", 10.1, 100);
  const fillers = Array.from({ length: 20 }, (_, i) => mover(`F${i}`, 15, 1_000_000 - i));
  const universe = [strong, ...fillers, weak];
  const full = selectGainersLosersFromUniverse(universe, 20, {
    extendedSession: false,
    nowMs: Date.parse("2026-10-28T16:45:00.000Z"),
  }).selected.map((t) => t.ticker);
  const chunkTop = [
    ...selectGainersLosersRanked([strong], 20),
    ...selectGainersLosersRanked([...fillers, weak], 20),
  ];
  const merged = selectGainersLosersRanked(chunkTop, 20).map((t) => t.ticker);
  assertEquals(full.includes("AAA"), false);
  assertEquals(merged.includes("AAA"), true);
});
