import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyIntelligence } from "../classify.ts";
import { evidenceHasAiInterpretation } from "../evidence.ts";
import { V1A_MANDATORY_FLAGS, failClosedFlags, readCatalystFlags } from "../flags.ts";
import { deriveLifecycle } from "../lifecycle.ts";
import { evaluateCatalystIntelligence } from "../pipeline.ts";
import { qualifyForAlert } from "../qualify.ts";
import { COMMENTARY_SCORE_CAP } from "../score.ts";
import { createNotificationRouter } from "../router.ts";
import { buildAlertEvent } from "../alerts.ts";
import {
  amdLongTermCommentary,
  irenErcotFactual,
  muVsSandiskCommentary,
  nowMs,
  occScheduledEarnings,
  orclPredictionCommentary,
} from "./fixtures.ts";

function assertCommentaryNoAlert(
  input: ReturnType<typeof orclPredictionCommentary>,
  label: string,
): void {
  const classified = classifyIntelligence(input);
  assertEquals(classified.classification, "commentary", label);
  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record, label);
  assertEquals(record.classification, "commentary", label);
  assert(record.scores.catalyst_score <= COMMENTARY_SCORE_CAP, `${label} score cap`);
  const q = qualifyForAlert(record, V1A_MANDATORY_FLAGS);
  assertEquals(q.qualified, false, label);
  assertEquals(q.reason, "COMMENTARY", label);
}

Deno.test("ORCL prediction headline is commentary and cannot alert", () => {
  const input = orclPredictionCommentary();
  assertCommentaryNoAlert(input, "ORCL");
  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record);
  assertEquals(record.direction === "bullish" || record.direction === "unknown" || record.direction === "mixed", true);
});

Deno.test("AMD long-term top-stock headline is commentary and cannot alert", () => {
  assertCommentaryNoAlert(amdLongTermCommentary(), "AMD");
});

Deno.test("MU vs Sandisk superior-buy headline is commentary and cannot alert", () => {
  assertCommentaryNoAlert(muVsSandiskCommentary(), "MU");
});

Deno.test("OCC scheduled earnings is hard/factual and not an earnings result", () => {
  const input = occScheduledEarnings();
  const classified = classifyIntelligence(input);
  assertEquals(classified.classification, "hard");
  assertEquals(classified.ticker_specific, true);
  assertEquals(classified.fact_state, "provider_fact");
  assertEquals(classified.direction, "unknown");
  assert(classified.reasons.includes("earnings_calendar_scheduled"));

  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record);
  assertEquals(record.lifecycle, "scheduled");
  assertEquals(record.direction, "unknown");
  assertEquals(record.evidence_as_of, "2026-09-08T20:00:00.000Z");
  assertEquals(record.market_context_as_of, null);
  const blob = JSON.stringify(record.evidence);
  assert(!/earnings beat/i.test(blob));
  assert(!/earnings miss/i.test(blob));
  assert(!/guidance raise/i.test(blob));
  assertEquals(input.facts?.actual_eps, undefined);
  assertEquals(input.facts?.surprise_percent, undefined);
  assertEquals(deriveLifecycle(input, classified, nowMs()), "scheduled");
});

Deno.test("IREN ERCOT classification is factual emerging/hard, not commentary", () => {
  const input = irenErcotFactual();
  const classified = classifyIntelligence(input);
  assert(classified.classification === "emerging" || classified.classification === "hard");
  assertEquals(classified.ticker_specific, true);
  assertEquals(classified.fact_state, "provider_fact");
  assert(classified.reasons.length > 0);
  assertEquals(classified.direction === "bullish", false);

  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record);
  assertEquals(record.classification === "commentary", false);
  const titleItem = record.evidence.items.find((i) => i.field === "title");
  assertExists(titleItem);
  assertEquals(titleItem.fact_state, "provider_fact");
  assertEquals(evidenceHasAiInterpretation(record.evidence), false);
  assertEquals(record.evidence.evidence_as_of, "2026-09-08T18:00:00.000Z");
  assertEquals(record.market_context_as_of, null);
  assertEquals(record.lifecycle, "developing");
});

Deno.test("exact flag parsing fail-closed including write flag", () => {
  const closed = failClosedFlags();
  assertEquals(closed.catalystIntelligenceEnabled, false);
  assertEquals(closed.catalystIntelligenceWriteEnabled, false);
  assertEquals(closed.catalystAlertGenerationEnabled, false);
  assertEquals(closed.alertDeliveryEnabled, false);

  for (const value of ["TRUE", "1", "yes", "true ", "", undefined]) {
    const flags = readCatalystFlags({
      CATALYST_INTELLIGENCE_ENABLED: value,
      CATALYST_INTELLIGENCE_WRITE_ENABLED: value,
      CATALYST_ALERT_GENERATION_ENABLED: value,
      ALERT_DELIVERY_ENABLED: value,
    });
    if (value === "true") {
      assertEquals(flags.catalystIntelligenceWriteEnabled, true);
    } else {
      assertEquals(flags.catalystIntelligenceWriteEnabled, false);
      assertEquals(flags.catalystIntelligenceEnabled, false);
    }
  }
});

Deno.test("alert generation stays disabled unless exact flag and router still refuses", () => {
  const record = evaluateCatalystIntelligence(occScheduledEarnings(), nowMs());
  assertExists(record);
  const flags = readCatalystFlags({
    CATALYST_INTELLIGENCE_ENABLED: "true",
    CATALYST_ALERT_GENERATION_ENABLED: "false",
  });
  const q = qualifyForAlert(record, flags);
  assertEquals(q.qualified, false);
  assertEquals(q.reason, "ALERT_GENERATION_DISABLED");
  const routed = createNotificationRouter(flags).route(buildAlertEvent(record, record.created_at));
  assertEquals(routed.delivered, false);
  assertEquals(routed.attempted, false);
});
