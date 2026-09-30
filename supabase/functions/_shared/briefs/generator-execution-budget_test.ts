import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AI_MAX_TRANSPORT_ATTEMPTS } from "../ai/retry-policy.ts";
import {
  BRIEF_CONTEXT_PERSISTENCE_RESERVE_MS,
  BRIEF_EXECUTION_HEADROOM_MS,
  BRIEF_RETRY_BACKOFF_WORST_MS,
  GENERATOR_INVOKE_TIMEOUT_MS,
  briefAiFitsGeneratorInvokeBudget,
  briefProviderAttemptTimeoutMs,
  worstCaseBriefProviderWallClockMs,
} from "./generator-execution-budget.ts";

Deno.test("two provider attempts plus backoff fit inside dispatcher invoke budget", () => {
  assertEquals(briefAiFitsGeneratorInvokeBudget(), true);
  const worst = worstCaseBriefProviderWallClockMs()
    + BRIEF_CONTEXT_PERSISTENCE_RESERVE_MS
    + BRIEF_EXECUTION_HEADROOM_MS;
  assertEquals(worst <= GENERATOR_INVOKE_TIMEOUT_MS, true);
  assertEquals(
    AI_MAX_TRANSPORT_ATTEMPTS * briefProviderAttemptTimeoutMs() + BRIEF_RETRY_BACKOFF_WORST_MS,
    worstCaseBriefProviderWallClockMs(),
  );
});
