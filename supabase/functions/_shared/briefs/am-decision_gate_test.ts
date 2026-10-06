import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideAmGeneration } from "./am-decision.ts";
import type { AmMaterialState } from "./am-evidence.ts";

const state: AmMaterialState = {
  index_signs: { SPY: 1, QQQ: 1, DIA: 1, IWM: 1 },
  index_pcts: { SPY: 0.1, QQQ: 0.1, DIA: 0.1, IWM: 0.1 },
  leadership: ["QQQ", "SPY", "DIA", "IWM"],
  headline_ids: [],
  catalyst_ids: [],
  earnings_ids: [],
  continuation_keys: [],
};

Deno.test("pre-market brief fail-closes stale inputs", () => {
  assertEquals(
    decideAmGeneration({
      indexesValid: false,
      staleOrMissingReason: "source_stale",
      existing: null,
      incomingState: state,
    }),
    { action: "fail_closed", reason: "source_stale" },
  );
});

Deno.test("pre-market brief first eligible run generates an insert", () => {
  assertEquals(
    decideAmGeneration({
      indexesValid: true,
      existing: null,
      incomingState: state,
    }),
    { action: "generate", persist: "insert" },
  );
});

Deno.test("pre-market brief duplicate invocation returns the cached brief", () => {
  const existing = {
    id: "brief-1",
    generated_at: "2026-10-05T08:10:00.000Z",
    market_snapshot: {
      version: "am_v2",
      source: "am_intelligence_v2",
      material_state: state,
      generation_window: "early",
    },
  };
  const decision = decideAmGeneration({
    indexesValid: true,
    existing,
    incomingState: state,
    nowMinutesEt: 4 * 60 + 10,
  });
  assertEquals(decision.action, "return_cached");
});
