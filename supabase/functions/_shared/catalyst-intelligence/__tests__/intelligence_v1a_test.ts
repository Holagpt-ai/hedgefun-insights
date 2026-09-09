import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { executeProviderAdapter, listExecutableAdapters } from "../adapters.ts";
import {
  alertDedupeKey,
  buildAlertEvent,
  createMemoryAlertQueue,
  emitAlertEvent,
} from "../alerts.ts";
import { classifyIntelligence, looksLikeCommentaryHeadline } from "../classify.ts";
import { evidenceHasAiInterpretation, secProviderFactsIntact } from "../evidence.ts";
import {
  failClosedFlags,
  readCatalystFlags,
  V1A_MANDATORY_FLAGS,
} from "../flags.ts";
import { evaluateCatalystIntelligence, runIntelligencePipeline } from "../pipeline.ts";
import { qualifyForAlert } from "../qualify.ts";
import { createNotificationRouter, DELIVERY_DISABLED_REASON } from "../router.ts";
import {
  COMMENTARY_SCORE_CAP,
  HIGH_PRIORITY_THRESHOLD,
  scoreIntelligence,
} from "../score.ts";
import {
  earningsCalendar,
  fdaApproval,
  nowMs,
  opinionHeadline,
  secEightK,
  unknownProviderHardLooking,
} from "./fixtures.ts";

Deno.test("opinion headlines classify as commentary", () => {
  assert(looksLikeCommentaryHeadline("Is AAPL still a buy after this week's rally?"));
  const classified = classifyIntelligence(opinionHeadline());
  assertEquals(classified.classification, "commentary");
  const record = evaluateCatalystIntelligence(opinionHeadline(), nowMs());
  assertExists(record);
  assertEquals(record.classification, "commentary");
});

Deno.test("SEC factual events preserve provider facts and unknown direction", () => {
  const input = secEightK();
  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record);
  assertEquals(record.provider, "sec_edgar");
  assertEquals(record.event_type, "sec_filing_news");
  assertEquals(record.fact_state, "provider_fact");
  assertEquals(record.direction, "unknown");
  assertEquals(record.classification, "hard");
  assert(secProviderFactsIntact(record.evidence, input));
  assertEquals(evidenceHasAiInterpretation(record.evidence), false);
  assertEquals(record.evidence.source_url, input.source_url);
  const form = record.evidence.items.find((i) => i.field === "form_type");
  assertExists(form);
  assertEquals(form.value, "8-K");
  assertEquals(form.fact_state, "provider_fact");
  const accession = record.evidence.items.find((i) => i.field === "accession_number");
  assertExists(accession);
  assertEquals(accession.fact_state, "provider_fact");
  assert(!record.evidence.classification_reasons.some((r) => r.includes("ai")));
});

Deno.test("strong hard catalysts score appropriately", () => {
  const input = fdaApproval();
  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record);
  assertEquals(record.classification, "hard");
  assertEquals(record.direction, "bullish");
  assert(record.scores.catalyst_score >= HIGH_PRIORITY_THRESHOLD);
  assert(record.scores.materiality >= 85);
  assert(record.scores.source_quality >= 70);
  assert(record.scores.ticker_specificity >= 80);

  const earnings = evaluateCatalystIntelligence(earningsCalendar(), nowMs());
  assertExists(earnings);
  assertEquals(earnings.classification, "hard");
  assertEquals(earnings.fact_state, "provider_fact");
  assertEquals(earnings.direction, "bullish");
  assert(earnings.scores.catalyst_score >= HIGH_PRIORITY_THRESHOLD);
});

Deno.test("low-quality commentary cannot become high-priority from ticker specificity", () => {
  const input = opinionHeadline();
  const classified = classifyIntelligence(input);
  assertEquals(classified.classification, "commentary");
  assertEquals(classified.ticker_specific, true);
  const scores = scoreIntelligence(input, classified, nowMs());
  assertEquals(scores.ticker_specificity, 90);
  assert(scores.catalyst_score <= COMMENTARY_SCORE_CAP);
  assert(scores.catalyst_score < HIGH_PRIORITY_THRESHOLD);

  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record);
  const q = qualifyForAlert(record, V1A_MANDATORY_FLAGS);
  assertEquals(q.qualified, false);
  assertEquals(q.reason, "COMMENTARY");
});

Deno.test("alert events generate only when qualification rules are met", () => {
  const queue = createMemoryAlertQueue();
  const flags = V1A_MANDATORY_FLAGS;
  const hard = runIntelligencePipeline(fdaApproval(), flags, { nowMs: nowMs(), queue });
  assertEquals(hard.skipped, false);
  assertExists(hard.alert);
  assertEquals(hard.alert.emitted, true);
  assertEquals(hard.alert.reason, "EMITTED");
  assertEquals(hard.alert.delivered, false);

  const commentary = runIntelligencePipeline(opinionHeadline(), flags, {
    nowMs: nowMs(),
    queue,
  });
  assertExists(commentary.alert);
  assertEquals(commentary.alert.emitted, false);
  assertEquals(commentary.alert.reason, "COMMENTARY");

  const context = runIntelligencePipeline(
    {
      ...opinionHeadline(),
      title: "Apple names new VP of engineering",
      description: null,
      dedupe_key: "polygon:art-ctx:AAPL",
      facts: { attribution_class: "direct", ticker_specific: true },
    },
    flags,
    { nowMs: nowMs(), queue },
  );
  assertExists(context.record);
  assertEquals(context.record.classification, "context");
  assertExists(context.alert);
  assertEquals(context.alert.emitted, false);
  assertEquals(context.alert.reason, "CONTEXT_ONLY");
});

Deno.test("duplicate alerts collapse via dedupeKey", () => {
  const queue = createMemoryAlertQueue();
  const flags = V1A_MANDATORY_FLAGS;
  const first = runIntelligencePipeline(fdaApproval(), flags, { nowMs: nowMs(), queue });
  const second = runIntelligencePipeline(fdaApproval(), flags, { nowMs: nowMs(), queue });
  assertExists(first.alert?.event);
  assertExists(second.alert);
  assertEquals(second.alert.collapsed, true);
  assertEquals(second.alert.reason, "COLLAPSED");
  assertEquals(first.alert.event.dedupeKey, alertDedupeKey(fdaApproval().dedupe_key));
  assertEquals(queue.all().length, 1);
  assertEquals(queue.all()[0].dedupeKey, first.alert.event.dedupeKey);
});

Deno.test("ALERT_DELIVERY_ENABLED=false prevents delivery", () => {
  const flags = readCatalystFlags({
    CATALYST_INTELLIGENCE_ENABLED: "true",
    CATALYST_ALERT_GENERATION_ENABLED: "true",
    ALERT_DELIVERY_ENABLED: "false",
    PUSH_NOTIFICATIONS_ENABLED: "false",
    SMS_NOTIFICATIONS_ENABLED: "false",
    EMAIL_NOTIFICATIONS_ENABLED: "false",
  });
  assertEquals(flags.alertDeliveryEnabled, false);
  assertEquals(flags.pushNotificationsEnabled, false);
  assertEquals(flags.smsNotificationsEnabled, false);
  assertEquals(flags.emailNotificationsEnabled, false);

  const record = evaluateCatalystIntelligence(fdaApproval(), nowMs());
  assertExists(record);
  const built = buildAlertEvent(record, new Date(nowMs()).toISOString());
  const routed = createNotificationRouter(flags).route(built);
  assertEquals(routed.delivered, false);
  assertEquals(routed.attempted, false);
  assertEquals(routed.reason, DELIVERY_DISABLED_REASON);
  assertEquals(routed.channels.push, false);
  assertEquals(routed.channels.sms, false);
  assertEquals(routed.channels.email, false);

  const emitted = emitAlertEvent(record, {
    flags,
    queue: createMemoryAlertQueue(),
    router: createNotificationRouter(flags),
    nowIso: built.createdAt,
  });
  assertEquals(emitted.delivered, false);
  assertExists(emitted.event);
  assertEquals(emitted.event.deliveryStatus, "suppressed");
  assertEquals(emitted.event.deliverySuppressedReason, DELIVERY_DISABLED_REASON);
});

Deno.test("no provider adapter executes in V1", () => {
  assertEquals(listExecutableAdapters(), []);
  for (const name of ["polygon", "sec_edgar", "earnings_calendar", "mystery_wire"]) {
    const result = executeProviderAdapter(name);
    assertEquals(result.executed, false);
    assertEquals(result.reason, "PROVIDER_ADAPTERS_DISABLED_IN_V1");
  }
});

Deno.test("unknown providers fail conservatively", () => {
  const input = unknownProviderHardLooking();
  const record = evaluateCatalystIntelligence(input, nowMs());
  assertExists(record);
  assertEquals(record.classification, "context");
  assert(record.scores.catalyst_score <= 40);
  assert(record.scores.source_quality <= 15);
  assert(record.scores.confidence <= 30);
  const q = qualifyForAlert(record, V1A_MANDATORY_FLAGS);
  assertEquals(q.qualified, false);
  assertEquals(q.reason, "UNKNOWN_PROVIDER");
});

Deno.test("intelligence disabled skips the pipeline", () => {
  const result = runIntelligencePipeline(fdaApproval(), failClosedFlags(), {
    nowMs: nowMs(),
    queue: createMemoryAlertQueue(),
  });
  assertEquals(result.skipped, true);
  assertEquals(result.record, null);
  assertEquals(result.alert, null);
});

Deno.test("V1 never emits ai_interpretation on SEC or earnings facts", () => {
  for (const input of [secEightK(), earningsCalendar()]) {
    const record = evaluateCatalystIntelligence(input, nowMs());
    assertExists(record);
    assertEquals(record.fact_state, "provider_fact");
    assertEquals(evidenceHasAiInterpretation(record.evidence), false);
  }
});
