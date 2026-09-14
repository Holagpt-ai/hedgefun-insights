import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideAmGeneration } from "./am-decision.ts";
import {
  activeSupersessionTarget,
  classifyBriefGenerationWindow,
  expectedGenerationWindow,
  inferLegacyGenerationWindow,
  isInsideFinalPreopenRecoveryEnvelope,
  resolveAmBriefFreshness,
  shouldRegenerateForWindowSupersession,
} from "./am-freshness.ts";

const BRIEF_DATE = "2026-09-14";

Deno.test("early brief is current at 4:20 AM ET", () => {
  const freshness = resolveAmBriefFreshness({
    nowMs: Date.parse("2026-09-14T08:20:00.000Z"),
    briefDate: BRIEF_DATE,
    nowEtDate: BRIEF_DATE,
    nowMinutesEt: 4 * 60 + 20,
    generatedAt: "2026-09-14T08:15:00.000Z",
    snapshotGenerationWindow: "early",
  });
  assertEquals(freshness.freshnessState, "current");
  assertEquals(freshness.generationWindow, "early");
});

Deno.test("mid window supersedes early brief at 7:30 AM ET", () => {
  const freshness = resolveAmBriefFreshness({
    nowMs: Date.parse("2026-09-14T11:30:00.000Z"),
    briefDate: BRIEF_DATE,
    nowEtDate: BRIEF_DATE,
    nowMinutesEt: 7 * 60 + 30,
    generatedAt: "2026-09-14T08:15:00.000Z",
    snapshotGenerationWindow: "early",
  });
  assertEquals(freshness.freshnessState, "stale");
  assertEquals(freshness.supersededBy, "mid");
});

Deno.test("final pre-open supersedes early brief at 8:45 AM ET", () => {
  const freshness = resolveAmBriefFreshness({
    nowMs: Date.parse("2026-09-14T12:45:00.000Z"),
    briefDate: BRIEF_DATE,
    nowEtDate: BRIEF_DATE,
    nowMinutesEt: 8 * 60 + 45,
    generatedAt: "2026-09-14T08:15:00.000Z",
    snapshotGenerationWindow: "early",
  });
  assertEquals(freshness.freshnessState, "stale");
  assertEquals(freshness.supersededBy, "final_preopen");
});

Deno.test("window supersession triggers generation inside later window", () => {
  const existing = {
    id: "brief-1",
    generated_at: "2026-09-14T08:15:00.000Z",
    market_snapshot: { generation_window: "early", version: "am_v2", source: "am_intelligence_v2" },
  };
  assertEquals(
    shouldRegenerateForWindowSupersession({
      nowMinutesEt: 7 * 60 + 15,
      existingGeneratedAt: existing.generated_at,
      existingSnapshot: existing.market_snapshot,
    }),
    true,
  );
  const decision = decideAmGeneration({
    indexesValid: true,
    existing,
    incomingState: {
      index_signs: { SPY: -1, QQQ: -1, DIA: -1, IWM: -1 },
      index_pcts: { SPY: -0.62, QQQ: -1.54, DIA: -0.4, IWM: -0.47 },
      leadership: ["IWM", "DIA", "SPY", "QQQ"],
      headline_ids: [],
      catalyst_ids: [],
      earnings_ids: [],
    },
    nowMinutesEt: 7 * 60 + 15,
  });
  assertEquals(decision.action, "generate");
});

Deno.test("same-window duplicate protection returns cached without material change", () => {
  const state = {
    index_signs: { SPY: 1, QQQ: 1, DIA: 1, IWM: 1 },
    index_pcts: { SPY: 0.2, QQQ: 0.2, DIA: 0.2, IWM: 0.2 },
    leadership: ["SPY", "QQQ", "DIA", "IWM"] as ("SPY" | "QQQ" | "DIA" | "IWM")[],
    headline_ids: [] as string[],
    catalyst_ids: [] as string[],
    earnings_ids: [] as string[],
  };
  const existing = {
    id: "brief-1",
    generated_at: "2026-09-14T11:05:00.000Z",
    market_snapshot: {
      generation_window: "mid",
      version: "am_v2",
      source: "am_intelligence_v2",
      material_state: state,
    },
  };
  assertEquals(
    shouldRegenerateForWindowSupersession({
      nowMinutesEt: 7 * 60 + 20,
      existingGeneratedAt: existing.generated_at,
      existingSnapshot: existing.market_snapshot,
    }),
    false,
  );
  const decision = decideAmGeneration({
    indexesValid: true,
    existing,
    incomingState: state,
    nowMinutesEt: 7 * 60 + 20,
  });
  assertEquals(decision.action, "return_cached");
});

Deno.test("classifies generation window from snapshot when present", () => {
  assertEquals(
    classifyBriefGenerationWindow("2026-09-14T08:15:00.000Z", "early"),
    "early",
  );
  assertEquals(expectedGenerationWindow(8 * 60 + 45), "final_preopen");
});

Deno.test("final pre-open recovery remains eligible after nominal 8:50 end", () => {
  assertEquals(isInsideFinalPreopenRecoveryEnvelope(8 * 60 + 55), true);
  assertEquals(activeSupersessionTarget(9 * 60), "final_preopen");
  assertEquals(
    shouldRegenerateForWindowSupersession({
      nowMinutesEt: 9 * 60,
      existingGeneratedAt: "2026-09-14T11:05:00.000Z",
      existingSnapshot: { generation_window: "mid" },
    }),
    true,
  );
});

Deno.test("existing final brief does not regenerate during recovery envelope", () => {
  assertEquals(
    shouldRegenerateForWindowSupersession({
      nowMinutesEt: 9 * 60 + 15,
      existingGeneratedAt: "2026-09-14T12:40:00.000Z",
      existingSnapshot: { generation_window: "final_preopen" },
    }),
    false,
  );
  const state = {
    index_signs: { SPY: 1, QQQ: 1, DIA: 1, IWM: 1 },
    index_pcts: { SPY: 0.2, QQQ: 0.2, DIA: 0.2, IWM: 0.2 },
    leadership: ["SPY", "QQQ", "DIA", "IWM"] as ("SPY" | "QQQ" | "DIA" | "IWM")[],
    headline_ids: [] as string[],
    catalyst_ids: [] as string[],
    earnings_ids: [] as string[],
  };
  const existing = {
    id: "brief-final",
    generated_at: "2026-09-14T12:40:00.000Z",
    market_snapshot: {
      generation_window: "final_preopen",
      version: "am_v2",
      source: "am_intelligence_v2",
      material_state: state,
    },
  };
  const decision = decideAmGeneration({
    indexesValid: true,
    existing,
    incomingState: state,
    nowMinutesEt: 9 * 60 + 15,
  });
  assertEquals(decision.action, "return_cached");
});

Deno.test("legacy rows without generation_window infer from generated_at", () => {
  assertEquals(inferLegacyGenerationWindow("2026-09-14T08:15:00.000Z"), "early");
  assertEquals(inferLegacyGenerationWindow("2026-09-14T11:05:00.000Z"), "mid");
  assertEquals(classifyBriefGenerationWindow("2026-09-14T08:15:00.000Z", null), "early");
  const freshness = resolveAmBriefFreshness({
    nowMs: Date.parse("2026-09-14T12:45:00.000Z"),
    briefDate: BRIEF_DATE,
    nowEtDate: BRIEF_DATE,
    nowMinutesEt: 8 * 60 + 45,
    generatedAt: "2026-09-14T08:15:00.000Z",
    snapshotGenerationWindow: null,
  });
  assertEquals(freshness.generationWindow, "early");
  assertEquals(freshness.freshnessState, "stale");
});
