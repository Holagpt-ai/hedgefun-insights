/**
 * Local wall-clock regression for the representative sync-screener CPU path.
 * Supabase Edge documents ~2s actual CPU limit — local elapsed time is NOT production CPU.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  runRepresentativeSyncCpuBenchmark,
  type SyncCpuBenchmarkResult,
} from "./sync-screener-cpu-benchmark.ts";
import {
  createSessionVolumeCache,
  sessionQualificationVolume,
} from "./session-volume.ts";
import type { PolygonTicker } from "./selection.ts";

Deno.test("cpu: session volume cache stores results under bound context", () => {
  const nowMs = Date.parse("2026-10-28T16:45:00.000Z");
  const t: PolygonTicker = {
    ticker: "X",
    updated: nowMs * 1_000_000,
    day: { v: 100_000 },
    min: { av: 100_000, t: nowMs },
  };
  const cache = createSessionVolumeCache({
    nowMs,
    observationSessionVolume: true,
    extendedSession: false,
  });
  const ctx = { observationSessionVolume: true, nowMs, cache };
  assertEquals(sessionQualificationVolume(t, ctx), 100_000);
  assertEquals(cache.qualificationVolume.has(t), true);
});

function logBenchmark(label: string, result: SyncCpuBenchmarkResult) {
  console.log(
    `[sync-screener-cpu-benchmark] ${label} ${JSON.stringify({
      session: result.session,
      universe_size: result.universe_size,
      optimized_ms: result.optimized,
      legacy_multi_pass_ms: result.legacy_multi_pass,
      row_count: result.row_count,
      rpc_payload_bytes: result.rpc_payload_bytes,
      note: "local_elapsed_not_edge_cpu",
    })}`,
  );
}

for (const session of ["regular", "pre-market", "after-hours"] as const) {
  Deno.test({
    name: `cpu benchmark: ${session} session 13,262-symbol staged path`,
    fn() {
      const result = runRepresentativeSyncCpuBenchmark(session);
      logBenchmark(session, result);
      assertEquals(result.universe_size, 13_262);
      assertEquals(result.row_count > 0, true);
      assertEquals(result.rpc_payload_bytes > 0, true);
      if (result.legacy_multi_pass) {
        assertEquals(
          result.optimized.total_sync_cpu_path_ms <=
            result.legacy_multi_pass.total_sync_cpu_path_ms * 1.05,
          true,
          `optimized ${result.optimized.total_sync_cpu_path_ms.toFixed(0)}ms vs legacy ${result.legacy_multi_pass.total_sync_cpu_path_ms.toFixed(0)}ms`,
        );
      }
    },
    sanitizeOps: false,
    sanitizeResources: false,
  });
}
