import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveRadarLoopHealth } from "./run-health.ts";

Deno.test("V2 persist failure reports degraded even when feed is fresh", () => {
  assertEquals(
    resolveRadarLoopHealth({
      leaseHeld: true,
      feedStale: false,
      persistenceV2Enabled: true,
      v2: { ok: false, code: "persist_failed" },
      v1Attempted: true,
      v1Ok: true,
    }),
    "degraded",
  );
});

Deno.test("V1-only failure reports degraded", () => {
  assertEquals(
    resolveRadarLoopHealth({
      leaseHeld: true,
      feedStale: false,
      persistenceV2Enabled: false,
      v2: "skipped",
      v1Attempted: true,
      v1Ok: false,
    }),
    "degraded",
  );
});

Deno.test("successful V2 with fresh feed reports running", () => {
  assertEquals(
    resolveRadarLoopHealth({
      leaseHeld: true,
      feedStale: false,
      persistenceV2Enabled: true,
      v2: { ok: true },
      v1Attempted: true,
      v1Ok: true,
    }),
    "running",
  );
});
