import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type {
  BaselineRow,
  ReplaceGenerationArgs,
  ReplaceGenerationWithExclusionsArgs,
  ExclusionAwareRpcFn,
  RpcFn,
} from "./persist.ts";
import {
  publishGeneration,
  publishGenerationWithExclusions,
  validateGeneration,
} from "./persist.ts";

const GEN = "11111111-2222-3333-4444-555555555555";
const AS_OF = "2026-08-12T20:00:01.000Z";
const START = "2026-08-10";
const END = "2026-08-12";

function validRow(overrides: Partial<BaselineRow> = {}): BaselineRow {
  return {
    symbol: "AAPL",
    period_start: START,
    period_end: END,
    high_52w: 12,
    low_52w: 4,
    high_candidates: [
      { d: "2026-08-11", v: 12 },
      { d: "2026-08-12", v: 9 },
    ],
    low_candidates: [
      { d: "2026-08-11", v: 4 },
      { d: "2026-08-12", v: 7 },
    ],
    sessions_observed: 2,
    provider_as_of: AS_OF,
    ...overrides,
  };
}

function recordingRpc(
  calls: ReplaceGenerationArgs[],
  impl?: RpcFn,
): RpcFn {
  return async (args) => {
    calls.push(args);
    if (impl) return impl(args);
    return { error: null };
  };
}

Deno.test("validateGeneration accepts a complete staged generation", () => {
  assertEquals(
    validateGeneration([validRow()], START, END, GEN, AS_OF),
    true,
  );
  assertEquals(validateGeneration([], START, END, GEN, AS_OF), true);
});

Deno.test("validateGeneration rejects inverted high/low and bad symbols", () => {
  assertEquals(
    validateGeneration(
      [validRow({ high_52w: 3, high_candidates: [{ d: "2026-08-11", v: 3 }] })],
      START,
      END,
      GEN,
      AS_OF,
    ),
    false,
  );
  assertEquals(
    validateGeneration(
      [validRow({ symbol: "bad ticker" })],
      START,
      END,
      GEN,
      AS_OF,
    ),
    false,
  );
});

Deno.test("failed RPC retains prior generation and does not publish a new pointer", async () => {
  const calls: ReplaceGenerationArgs[] = [];
  const published = await publishGeneration(
    recordingRpc(calls, async () => ({ error: { message: "persist_failed" } })),
    {
      generationId: GEN,
      rows: [validRow({ sessions_observed: 120 })],
      periodStart: START,
      periodEnd: END,
      providerAsOf: AS_OF,
    },
  );
  assertEquals(published.ok, false);
  if (published.ok) return;
  assertEquals(published.code, "persist_failed");
  assertEquals(calls.length, 1);
  assertEquals(calls[0].p_generation_id, GEN);
});

Deno.test("validation failure never calls RPC so the prior pointer is unchanged", async () => {
  const calls: ReplaceGenerationArgs[] = [];
  const published = await publishGeneration(recordingRpc(calls), {
    generationId: GEN,
    rows: [validRow({ high_52w: 1, low_52w: 4 })],
    periodStart: START,
    periodEnd: END,
    providerAsOf: AS_OF,
  });
  assertEquals(published.ok, false);
  if (published.ok) return;
  assertEquals(published.code, "validation_failed");
  assertEquals(calls.length, 0);
});

Deno.test("RPC throw is treated as persist_failed without exposing a generation", async () => {
  const calls: ReplaceGenerationArgs[] = [];
  const published = await publishGeneration(
    recordingRpc(calls, async () => {
      throw new Error("network");
    }),
    {
      generationId: GEN,
      rows: [validRow({ sessions_observed: 120 })],
      periodStart: START,
      periodEnd: END,
      providerAsOf: AS_OF,
    },
  );
  assertEquals(published.ok, false);
  if (published.ok) return;
  assertEquals(published.code, "persist_failed");
  assertEquals(calls.length, 1);
});

function recordingExclusionRpc(
  calls: ReplaceGenerationWithExclusionsArgs[],
  impl?: ExclusionAwareRpcFn,
): ExclusionAwareRpcFn {
  return async (args) => {
    calls.push(args);
    if (impl) return impl(args);
    return { error: null };
  };
}

Deno.test("legacy publishGeneration does not attach policy evidence", async () => {
  const calls: ReplaceGenerationArgs[] = [];
  const published = await publishGeneration(recordingRpc(calls), {
    generationId: GEN,
    rows: [validRow()],
    periodStart: START,
    periodEnd: END,
    providerAsOf: AS_OF,
  });
  assertEquals(published.ok, true);
  if (!published.ok) return;
  assertEquals(published.state.policy_min_sessions, null);
  assertEquals(published.state.policy_excluded_count, null);
  assertEquals("p_exclusions" in calls[0], false);
});

Deno.test("exclusion-aware publish attaches validated policy evidence", async () => {
  const calls: ReplaceGenerationWithExclusionsArgs[] = [];
  const published = await publishGenerationWithExclusions(
    recordingExclusionRpc(calls),
    {
      generationId: GEN,
      rows: [validRow({ sessions_observed: 120 })],
      exclusions: [{
        symbol: "IPO",
        reason: "insufficient_sessions",
        sessions_observed: 40,
        min_sessions: 120,
      }],
      minSessions: 120,
      periodStart: START,
      periodEnd: END,
      providerAsOf: AS_OF,
    },
  );
  assertEquals(published.ok, true);
  if (!published.ok) return;
  assertEquals(published.state.policy_min_sessions, 120);
  assertEquals(published.state.policy_excluded_count, 1);
  assertEquals(calls[0].p_exclusions[0].symbol, "IPO");
  assertEquals(calls[0].p_min_sessions, 120);
});

Deno.test("overlapping exclusion never calls RPC so mixed evidence cannot persist", async () => {
  const calls: ReplaceGenerationWithExclusionsArgs[] = [];
  const published = await publishGenerationWithExclusions(
    recordingExclusionRpc(calls),
    {
      generationId: GEN,
      rows: [validRow({ sessions_observed: 120 })],
      exclusions: [{
        symbol: "AAPL",
        reason: "insufficient_sessions",
        sessions_observed: 40,
        min_sessions: 120,
      }],
      minSessions: 120,
      periodStart: START,
      periodEnd: END,
      providerAsOf: AS_OF,
    },
  );
  assertEquals(published.ok, false);
  if (published.ok) return;
  assertEquals(published.code, "validation_failed");
  assertEquals(calls.length, 0);
});

Deno.test("exclusion-aware publish accepts sessions_observed equal to minSessions", async () => {
  const calls: ReplaceGenerationWithExclusionsArgs[] = [];
  const published = await publishGenerationWithExclusions(
    recordingExclusionRpc(calls),
    {
      generationId: GEN,
      rows: [validRow({ sessions_observed: 120 })],
      exclusions: [],
      minSessions: 120,
      periodStart: START,
      periodEnd: END,
      providerAsOf: AS_OF,
    },
  );
  assertEquals(published.ok, true);
  assertEquals(calls.length, 1);
});

Deno.test("exclusion-aware publish accepts sessions_observed above minSessions", async () => {
  const calls: ReplaceGenerationWithExclusionsArgs[] = [];
  const published = await publishGenerationWithExclusions(
    recordingExclusionRpc(calls),
    {
      generationId: GEN,
      rows: [validRow({ sessions_observed: 121 })],
      exclusions: [],
      minSessions: 120,
      periodStart: START,
      periodEnd: END,
      providerAsOf: AS_OF,
    },
  );
  assertEquals(published.ok, true);
  assertEquals(calls.length, 1);
});

Deno.test("under-min baseline row never reaches the exclusion-aware RPC", async () => {
  const calls: ReplaceGenerationWithExclusionsArgs[] = [];
  const published = await publishGenerationWithExclusions(
    recordingExclusionRpc(calls),
    {
      generationId: GEN,
      rows: [validRow({ sessions_observed: 119 })],
      exclusions: [],
      minSessions: 120,
      periodStart: START,
      periodEnd: END,
      providerAsOf: AS_OF,
    },
  );
  assertEquals(published.ok, false);
  if (published.ok) return;
  assertEquals(published.code, "validation_failed");
  assertEquals(calls.length, 0);
});

Deno.test("missing baseline sessions_observed never reaches the exclusion-aware RPC", async () => {
  const calls: ReplaceGenerationWithExclusionsArgs[] = [];
  const { sessions_observed: _dropped, ...rest } = validRow({
    sessions_observed: 120,
  });
  const published = await publishGenerationWithExclusions(
    recordingExclusionRpc(calls),
    {
      generationId: GEN,
      rows: [rest as typeof rest & { sessions_observed: number }],
      exclusions: [],
      minSessions: 120,
      periodStart: START,
      periodEnd: END,
      providerAsOf: AS_OF,
    },
  );
  assertEquals(published.ok, false);
  if (published.ok) return;
  assertEquals(published.code, "validation_failed");
  assertEquals(calls.length, 0);
});

Deno.test("non-integer baseline sessions_observed never reaches the exclusion-aware RPC", async () => {
  const calls: ReplaceGenerationWithExclusionsArgs[] = [];
  const published = await publishGenerationWithExclusions(
    recordingExclusionRpc(calls),
    {
      generationId: GEN,
      rows: [validRow({ sessions_observed: 120.5 })],
      exclusions: [],
      minSessions: 120,
      periodStart: START,
      periodEnd: END,
      providerAsOf: AS_OF,
    },
  );
  assertEquals(published.ok, false);
  if (published.ok) return;
  assertEquals(published.code, "validation_failed");
  assertEquals(calls.length, 0);
});
