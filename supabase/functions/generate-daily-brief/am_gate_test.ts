import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AM_INDEX_SYMBOLS,
  validateIndexRows,
  type AmMaterialState,
} from "../_shared/briefs/am-evidence.ts";
import { decideAmGeneration } from "../_shared/briefs/am-decision.ts";

const NOW_MS = Date.parse("2026-08-28T08:00:00.000Z");

function rows(updatedAt: string) {
  return AM_INDEX_SYMBOLS.map((symbol) => ({
    symbol,
    current_value: 100,
    change_percent: 0.2,
    updated_at: updatedAt,
  }));
}

function state(): AmMaterialState {
  return {
    index_signs: { SPY: 1, QQQ: 1, DIA: 1, IWM: 1 },
    index_pcts: { SPY: 0.2, QQQ: 0.2, DIA: 0.2, IWM: 0.2 },
    leadership: ["SPY", "QQQ", "DIA", "IWM"],
    headline_ids: [],
    catalyst_ids: [],
    earnings_ids: [],
  };
}

Deno.test("fresh index allows the AM generation path", () => {
  const freshAt = "2026-08-28T07:58:00.000Z"; // 2 minutes old at 08:00 UTC
  const validation = validateIndexRows(rows(freshAt), NOW_MS);
  assertEquals(validation.ok, true);
  const decision = decideAmGeneration({
    indexesValid: validation.ok,
    existing: null,
    incomingState: state(),
  });
  assertEquals(decision.action, "generate");
  if (decision.action === "generate") assertEquals(decision.persist, "insert");
});

Deno.test("stale index returns available:false source_stale", () => {
  const staleAt = "2026-08-28T07:45:00.000Z"; // 15 minutes old
  const validation = validateIndexRows(rows(staleAt), NOW_MS);
  assertEquals(validation.ok, false);
  if (!validation.ok) assertEquals(validation.reason, "source_stale");
  const decision = decideAmGeneration({
    indexesValid: false,
    staleOrMissingReason: validation.ok ? undefined : validation.reason,
    existing: null,
    incomingState: state(),
  });
  assertEquals(decision, { action: "fail_closed", reason: "source_stale" });
  const body = {
    available: false as const,
    reason: "source_stale",
    brief_type: "am",
    brief_date: "2026-08-28",
  };
  assertEquals(body.available, false);
  assertEquals(body.reason, "source_stale");
});
