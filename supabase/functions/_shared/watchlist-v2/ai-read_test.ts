import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAiPrompt, buildEvidenceCatalog, EVIDENCE_PREFIXES, validateAiOutput,
} from "./ai-read.ts";

const catalog = buildEvidenceCatalog({
  market_signals: [
    { signal_id: "s1", label: "l", category: "trend", kind: "state",
      direction: "bullish", facts: {}, inputs: [], observed_at: "2026-07-23T10:00:00Z",
      rule_version: "w2b1c.1" },
  ] as any,
  recent_events: [
    { event_id: "e1", event_type: "news", title: "t", event_time: "2026-07-23T10:00:00Z",
      source_name: "s", source_url: null, verification_state: "provider_reported",
      ingested_at: "2026-07-23T10:00:00Z" },
  ] as any,
  key_levels: { vwap: 100, hod: null, basis: { hod_lod_scope: "rth", vwap_scope: "rth" } },
  metrics: ["rvol"],
});

const ID_SIGNAL = `${EVIDENCE_PREFIXES.signal}s1`;
const ID_EVENT = `${EVIDENCE_PREFIXES.event}e1`;
const ID_LEVEL = `${EVIDENCE_PREFIXES.level}vwap`;
const ID_METRIC = `${EVIDENCE_PREFIXES.metric}rvol`;

Deno.test("catalog contains prefixed ids and skips null levels/basis", () => {
  assert(catalog.ids.has(ID_SIGNAL));
  assert(catalog.ids.has(ID_EVENT));
  assert(catalog.ids.has(ID_LEVEL));
  assert(catalog.ids.has(ID_METRIC));
  assert(!catalog.ids.has(`${EVIDENCE_PREFIXES.level}hod`));
  assert(!catalog.ids.has(`${EVIDENCE_PREFIXES.level}basis`));
});

Deno.test("prompt embeds ticker and allowed ids", () => {
  const p = buildAiPrompt({
    ticker: "MSFT", session_type: "rth", session_date: "2026-07-23",
    price: 100, change_pct: 1, volume: 100, rvol: 1.2, rvol_class: "normal",
    key_levels: {}, market_signals: [], recent_events: [], reason_codes: [],
  }, catalog);
  assert(p.includes("MSFT"));
  assert(p.includes("NEVER produce a score"));
  assert(p.includes("allowed_driver_ids"));
});

Deno.test("accepts strict json with 1 driver from catalog", () => {
  const r = validateAiOutput(
    `{"direction":"bullish","explanation":"Above VWAP.","driver_ids":["${ID_SIGNAL}"]}`,
    catalog,
  );
  assertEquals(r.kind, "ok");
});

Deno.test("rejects data_unavailable from AI", () => {
  const r = validateAiOutput(
    `{"direction":"data_unavailable","explanation":"x","driver_ids":["${ID_SIGNAL}"]}`,
    catalog,
  );
  assertEquals(r.kind, "validation_failed");
});

Deno.test("rejects unparseable", () => {
  assertEquals(validateAiOutput("not json", catalog).kind, "validation_failed");
});

Deno.test("strips markdown fences", () => {
  const r = validateAiOutput(
    `\`\`\`json\n{"direction":"bullish","explanation":"Up.","driver_ids":["${ID_SIGNAL}"]}\n\`\`\``,
    catalog,
  );
  assertEquals(r.kind, "ok");
});

Deno.test("rejects extra top-level key", () => {
  const r = validateAiOutput(
    `{"direction":"bullish","explanation":"x","driver_ids":["${ID_SIGNAL}"],"extra":1}`,
    catalog,
  );
  assertEquals(r.kind, "validation_failed");
  if (r.kind === "validation_failed") assertEquals(r.reason, "extra_key");
});

Deno.test("rejects unknown driver id (no silent filter)", () => {
  const r = validateAiOutput(
    `{"direction":"bullish","explanation":"x","driver_ids":["signal:unknown"]}`,
    catalog,
  );
  assertEquals(r.kind, "validation_failed");
  if (r.kind === "validation_failed") assertEquals(r.reason, "unknown_driver_id");
});

Deno.test("rejects empty driver_ids", () => {
  const r = validateAiOutput(
    `{"direction":"bullish","explanation":"x","driver_ids":[]}`,
    catalog,
  );
  assertEquals(r.kind, "validation_failed");
});

Deno.test("rejects 7 driver_ids", () => {
  const ids = new Array(7).fill(ID_SIGNAL).map((_, i) => i === 0 ? ID_SIGNAL : ID_EVENT);
  // duplicates would trip first, but even unique count of 7 should fail — build 7 fake unique ids
  const catalog2 = buildEvidenceCatalog({
    market_signals: Array.from({ length: 7 }, (_, i) => ({
      signal_id: `s${i}`, label: "l", category: "trend", kind: "state",
      direction: "bullish", facts: {}, inputs: [], observed_at: "2026-07-23T10:00:00Z",
      rule_version: "w2b1c.1",
    })) as any,
    recent_events: [], key_levels: null, metrics: [],
  });
  const seven = Array.from({ length: 7 }, (_, i) => `signal:s${i}`);
  const r = validateAiOutput(
    `{"direction":"bullish","explanation":"x","driver_ids":${JSON.stringify(seven)}}`,
    catalog2,
  );
  assertEquals(r.kind, "validation_failed");
  if (r.kind === "validation_failed") assertEquals(r.reason, "bad_driver_ids_count");
  void ids;
});

Deno.test("rejects explanation over 240 chars", () => {
  const explanation = "x".repeat(241);
  const r = validateAiOutput(
    `{"direction":"neutral","explanation":"${explanation}","driver_ids":["${ID_SIGNAL}"]}`,
    catalog,
  );
  assertEquals(r.kind, "validation_failed");
});

Deno.test("recursively rejects forbidden nested score key", () => {
  const r = validateAiOutput(
    `{"direction":"bullish","explanation":"x","driver_ids":["${ID_SIGNAL}"],"meta":{"nested":{"hf_score":1}}}`,
    catalog,
  );
  assertEquals(r.kind, "validation_failed");
});

Deno.test("rejects duplicate driver ids", () => {
  const r = validateAiOutput(
    `{"direction":"bullish","explanation":"x","driver_ids":["${ID_SIGNAL}","${ID_SIGNAL}"]}`,
    catalog,
  );
  assertEquals(r.kind, "validation_failed");
  if (r.kind === "validation_failed") assertEquals(r.reason, "duplicate_driver_id");
});
