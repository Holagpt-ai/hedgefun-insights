import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  healthStatusOnWsSubscribed,
  resolveRadarLoopHealth,
  shouldClearPersistFailureTelemetry,
} from "./run-health.ts";

Deno.test("V2 persist failure reports degraded even when feed is fresh", () => {
  assertEquals(
    resolveRadarLoopHealth({
      leaseHeld: true,
      feedStale: false,
      persistenceV2Enabled: true,
      v2: { ok: false, code: "persist_failed" },
      v1Attempted: true,
      v1Ok: true,
      unresolvedPersistFailure: true,
    }),
    "degraded",
  );
});

Deno.test("V2 failure then cooldown skip stays degraded via unresolved flag", () => {
  assertEquals(
    resolveRadarLoopHealth({
      leaseHeld: true,
      feedStale: false,
      persistenceV2Enabled: true,
      v2: "skipped",
      v1Attempted: true,
      v1Ok: true,
      unresolvedPersistFailure: true,
    }),
    "degraded",
  );
});

Deno.test("normal no-change skip stays running without unresolved failure", () => {
  assertEquals(
    resolveRadarLoopHealth({
      leaseHeld: true,
      feedStale: false,
      persistenceV2Enabled: true,
      v2: "skipped",
      v1Attempted: true,
      v1Ok: true,
      unresolvedPersistFailure: false,
    }),
    "running",
  );
});

Deno.test("successful V2 retry clears degraded when unresolved flag is false", () => {
  assertEquals(
    resolveRadarLoopHealth({
      leaseHeld: true,
      feedStale: false,
      persistenceV2Enabled: true,
      v2: { ok: true },
      v1Attempted: true,
      v1Ok: true,
      unresolvedPersistFailure: false,
    }),
    "running",
  );
});

Deno.test("V1 failed with V2 success stays degraded", () => {
  assertEquals(
    resolveRadarLoopHealth({
      leaseHeld: true,
      feedStale: false,
      persistenceV2Enabled: true,
      v2: { ok: true },
      v1Attempted: true,
      v1Ok: false,
      unresolvedPersistFailure: false,
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
      unresolvedPersistFailure: true,
    }),
    "degraded",
  );
});

Deno.test("stale feed reports stale when persistence is otherwise healthy", () => {
  assertEquals(
    resolveRadarLoopHealth({
      leaseHeld: true,
      feedStale: true,
      persistenceV2Enabled: true,
      v2: "skipped",
      v1Attempted: false,
      v1Ok: true,
      unresolvedPersistFailure: false,
    }),
    "stale",
  );
});

Deno.test("WebSocket subscribed stays degraded when persistence failed", () => {
  assertEquals(
    healthStatusOnWsSubscribed({
      leaseHeld: true,
      connectionState: "subscribed",
      unresolvedPersistFailure: true,
    }),
    "degraded",
  );
});

Deno.test("WebSocket subscribed reports running without persist failure", () => {
  assertEquals(
    healthStatusOnWsSubscribed({
      leaseHeld: true,
      connectionState: "subscribed",
      unresolvedPersistFailure: false,
    }),
    "running",
  );
});

Deno.test("WebSocket non-subscribed does not override loop health", () => {
  assertEquals(
    healthStatusOnWsSubscribed({
      leaseHeld: true,
      connectionState: "reconnecting",
      unresolvedPersistFailure: false,
    }),
    null,
  );
});

Deno.test("V2 success does not clear telemetry while V1 recovery is required", () => {
  assertEquals(
    shouldClearPersistFailureTelemetry({
      persistenceV2Enabled: true,
      v1RecoveryRequired: true,
      v2: { ok: true },
      v1Attempted: false,
      v1Ok: true,
    }),
    false,
  );
});

Deno.test("V1 recovery clears telemetry after successful V1 publish with V2 ok", () => {
  assertEquals(
    shouldClearPersistFailureTelemetry({
      persistenceV2Enabled: true,
      v1RecoveryRequired: false,
      v2: { ok: true },
      v1Attempted: true,
      v1Ok: true,
    }),
    true,
  );
});

Deno.test("lease loss reports degraded", () => {
  assertEquals(
    resolveRadarLoopHealth({
      leaseHeld: false,
      feedStale: false,
      persistenceV2Enabled: true,
      v2: { ok: true },
      v1Attempted: false,
      v1Ok: true,
      unresolvedPersistFailure: false,
    }),
    "degraded",
  );
});
