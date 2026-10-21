import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CIRCUIT_COOLDOWN_MS,
  CIRCUIT_FAILURE_THRESHOLD,
  circuitBreakerDecision,
  recordCircuitFailure,
  recordCircuitSuccess,
} from "./circuit-breaker.ts";
import type { SourceRecord } from "./types.ts";

function source(): SourceRecord {
  return {
    id: "s1",
    sourceKey: "test",
    companyName: null,
    ticker: "AAA",
    cik: null,
    sourceType: "NEWS_PR",
    url: "https://example.com/feed",
    hostname: "example.com",
    feedFormat: "rss",
    pollIntervalSeconds: 300,
    enabled: true,
    priority: 1,
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    authorityKey: "example",
    lastSuccessAt: null,
    lastContentHash: null,
    lastEtag: null,
    lastModified: null,
    failureCount: 0,
    backoffUntil: null,
    lastErrorCategory: null,
    metadata: {},
  };
}

Deno.test("circuit opens after consecutive retryable failures", () => {
  const row = source();
  const now = 1_000_000;
  for (let i = 0; i < CIRCUIT_FAILURE_THRESHOLD; i += 1) {
    recordCircuitFailure(row, now + i, true);
  }
  const decision = circuitBreakerDecision(row, now + CIRCUIT_FAILURE_THRESHOLD);
  assertEquals(decision.allow, false);
  assertEquals(decision.state, "open");
});

Deno.test("circuit half-open probe after cooldown", () => {
  const row = source();
  const opened = 5_000_000;
  recordCircuitFailure(row, opened, true);
  recordCircuitFailure(row, opened + 1, true);
  recordCircuitFailure(row, opened + 2, true);
  recordCircuitFailure(row, opened + 3, true);
  recordCircuitFailure(row, opened + 4, true);
  const duringOpen = circuitBreakerDecision(row, opened + 1000);
  assertEquals(duringOpen.allow, false);
  const afterCooldown = circuitBreakerDecision(row, opened + CIRCUIT_COOLDOWN_MS + 1);
  assertEquals(afterCooldown.allow, true);
  assertEquals(afterCooldown.state, "half_open");
});

Deno.test("success closes circuit", () => {
  const row = source();
  recordCircuitFailure(row, 1, true);
  recordCircuitSuccess(row);
  assertEquals(circuitBreakerDecision(row, 2).state, "closed");
});
