import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  extractRunId, parseManualBody, parseTriggerBody, selectMode,
} from "../../analyze-watchlist-tickers-v2/index.ts";

Deno.test("selectMode: none when empty", () => {
  assertEquals(selectMode({}), "none");
  assertEquals(selectMode(null), "none");
  assertEquals(selectMode([]), "none");
});

Deno.test("selectMode: trigger when record present", () => {
  assertEquals(selectMode({ record: { symbol: "AAPL", user_id: "x" } }), "trigger");
});

Deno.test("selectMode: manual when ticker present", () => {
  assertEquals(selectMode({ ticker: "AAPL" }), "manual");
});

Deno.test("selectMode: ambiguous when both present", () => {
  assertEquals(selectMode({ ticker: "AAPL", record: { symbol: "AAPL" } }), "ambiguous");
});

Deno.test("parseTriggerBody: valid", () => {
  const uid = "11111111-2222-3333-4444-555555555555";
  const r = parseTriggerBody({ record: { symbol: "aapl", user_id: uid } });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.ticker, "AAPL");
    assertEquals(r.owner, uid);
  }
});

Deno.test("parseTriggerBody: invalid ticker rejected", () => {
  const uid = "11111111-2222-3333-4444-555555555555";
  const r = parseTriggerBody({ record: { symbol: "!!bad", user_id: uid } });
  assertEquals(r.ok, false);
});

Deno.test("parseTriggerBody: non-uuid user_id rejected", () => {
  const r = parseTriggerBody({ record: { symbol: "AAPL", user_id: "not-a-uuid" } });
  assertEquals(r.ok, false);
});

Deno.test("parseTriggerBody: missing record rejected", () => {
  assertEquals(parseTriggerBody({}).ok, false);
});

Deno.test("parseManualBody: valid", () => {
  const r = parseManualBody({ ticker: "msft" });
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.ticker, "MSFT");
});

Deno.test("parseManualBody: invalid ticker rejected", () => {
  assertEquals(parseManualBody({ ticker: "" }).ok, false);
  assertEquals(parseManualBody({ ticker: "lowercase!" }).ok, false);
});

Deno.test("extractRunId: valid uuid", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  assertEquals(extractRunId({ run_id: id }), id);
});

Deno.test("extractRunId: null when absent or invalid", () => {
  assertEquals(extractRunId({}), null);
  assertEquals(extractRunId({ run_id: "not-uuid" }), null);
  assertEquals(extractRunId({ run_id: 5 }), null);
});
