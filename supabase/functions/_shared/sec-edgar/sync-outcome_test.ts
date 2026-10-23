import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applySecSyncRunOutcome,
  SEC_SYNC_DEFAULT_FAILURE_PAUSE_THRESHOLD,
} from "./sync-outcome.ts";

Deno.test("three consecutive failures trigger automatic pause", () => {
  let state = {
    consecutive_failures: 0,
    ingestion_paused: false,
    failure_pause_threshold: SEC_SYNC_DEFAULT_FAILURE_PAUSE_THRESHOLD,
  };
  const r1 = applySecSyncRunOutcome(state, false);
  state = { ...state, consecutive_failures: r1.consecutive_failures, ingestion_paused: r1.ingestion_paused };
  assertEquals(r1.auto_pause_applied, false);
  const r2 = applySecSyncRunOutcome(state, false);
  state = { ...state, consecutive_failures: r2.consecutive_failures, ingestion_paused: r2.ingestion_paused };
  assertEquals(r2.auto_pause_applied, false);
  const r3 = applySecSyncRunOutcome(state, false);
  assertEquals(r3.consecutive_failures, 3);
  assertEquals(r3.ingestion_paused, true);
  assertEquals(r3.auto_pause_applied, true);
});

Deno.test("successful run resets failure counter but not pause flag", () => {
  const state = {
    consecutive_failures: 2,
    ingestion_paused: true,
    failure_pause_threshold: 3,
  };
  const ok = applySecSyncRunOutcome(state, true);
  assertEquals(ok.consecutive_failures, 0);
  assertEquals(ok.ingestion_paused, true);
  assertEquals(ok.auto_pause_applied, false);
});
