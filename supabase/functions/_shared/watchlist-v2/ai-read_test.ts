import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildAiPrompt, validateAiOutput } from "./ai-read.ts";

Deno.test("buildAiPrompt embeds ticker", () => {
  const p = buildAiPrompt({
    ticker: "MSFT", session_type: "rth", session_date: "2026-07-23",
    price: 100, change_pct: 1, volume: 100, rvol: 1.2, rvol_class: "normal",
    key_levels: {}, market_signals: [], recent_events: [], reason_codes: [],
  });
  assert(p.includes("MSFT"));
  assert(p.includes("NEVER produce a score"));
});

Deno.test("validateAiOutput accepts strict json", () => {
  const r = validateAiOutput('{"direction":"neutral","explanation":"Balanced.","driver_ids":[]}');
  assertEquals(r.kind, "ok");
});

Deno.test("validateAiOutput rejects data_unavailable from AI", () => {
  const r = validateAiOutput('{"direction":"data_unavailable","explanation":"x","driver_ids":[]}');
  assertEquals(r.kind, "validation_failed");
});

Deno.test("validateAiOutput rejects unparseable", () => {
  const r = validateAiOutput("not json");
  assertEquals(r.kind, "validation_failed");
});

Deno.test("validateAiOutput strips markdown fences", () => {
  const r = validateAiOutput('```json\n{"direction":"bullish","explanation":"Up.","driver_ids":["a"]}\n```');
  assertEquals(r.kind, "ok");
});
