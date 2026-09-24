import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAiPrompt, buildEvidenceCatalog, buildWatchlistAnthropicBody, EVIDENCE_PREFIXES,
  makeAnthropicCaller, validateAiOutput, DEFAULT_ANTHROPIC_WATCHLIST_MODEL,
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

// ── Anthropic transport diagnostics ──────────────────────────────────────

const API_KEY = "sk-ant-SECRET_KEY_VALUE";
const PROMPT = "SECRET_PROMPT_TEXT";

async function callWithFetch(impl: () => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = (() => impl()) as typeof fetch;
  try {
    return await makeAnthropicCaller(API_KEY).call(PROMPT, catalog);
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test("anthropic: 429 keeps RATE_LIMITED with status 429", async () => {
  const r = await callWithFetch(() => Promise.resolve(new Response("slow down", { status: 429 })));
  assertEquals(r.kind, "transport_failure");
  if (r.kind !== "transport_failure") return;
  assertEquals(r.code, "RATE_LIMITED");
  assertEquals(r.http_status, 429);
  assertEquals(r.failure_kind, "http_error");
});

for (const status of [401, 403, 404, 500]) {
  Deno.test(`anthropic: HTTP ${status} keeps PROVIDER_ERROR and reports status`, async () => {
    const r = await callWithFetch(() => Promise.resolve(new Response("upstream body", { status })));
    assertEquals(r.kind, "transport_failure");
    if (r.kind !== "transport_failure") return;
    assertEquals(r.code, "PROVIDER_ERROR");
    assertEquals(r.http_status, status);
    assertEquals(r.failure_kind, "http_error");
  });
}

Deno.test("anthropic: 200 with invalid JSON is PROVIDER_ERROR/200/invalid_json", async () => {
  const r = await callWithFetch(() => Promise.resolve(new Response("not json", { status: 200 })));
  assertEquals(r.kind, "transport_failure");
  if (r.kind !== "transport_failure") return;
  assertEquals(r.code, "PROVIDER_ERROR");
  assertEquals(r.http_status, 200);
  assertEquals(r.failure_kind, "invalid_json");
});

Deno.test("anthropic: timeout keeps PROVIDER_TIMEOUT and fabricates no status", async () => {
  const r = await callWithFetch(() => Promise.reject(new DOMException("Signal timed out.", "TimeoutError")));
  assertEquals(r.kind, "transport_failure");
  if (r.kind !== "transport_failure") return;
  assertEquals(r.code, "PROVIDER_TIMEOUT");
  assertEquals(r.http_status, null);
  assertEquals(r.failure_kind, "timeout");
});

Deno.test("anthropic: non-timeout fetch failure keeps PROVIDER_TIMEOUT but reads fetch_error", async () => {
  const r = await callWithFetch(() => Promise.reject(new TypeError("error sending request")));
  assertEquals(r.kind, "transport_failure");
  if (r.kind !== "transport_failure") return;
  assertEquals(r.code, "PROVIDER_TIMEOUT");
  assertEquals(r.http_status, null);
  assertEquals(r.failure_kind, "fetch_error");
});

Deno.test("anthropic transport failure carries no key, prompt, url, or body", async () => {
  const r = await callWithFetch(() =>
    Promise.resolve(new Response("SECRET_BODY", { status: 500 }))
  );
  assertEquals(Object.keys(r).sort(), [
    "code", "failure_kind", "http_status", "kind",
    "provider_error_message", "provider_error_type",
  ]);
  const serialized = JSON.stringify(r);
  for (const forbidden of ["SECRET_KEY_VALUE", "SECRET_PROMPT_TEXT", "SECRET_BODY", "x-api-key", "anthropic", "https://"]) {
    assert(!serialized.includes(forbidden), `leaked ${forbidden}`);
  }
});

Deno.test("anthropic: valid request succeeds and posts only model, max_tokens, and one user message", async () => {
  const original = globalThis.fetch;
  let posted = "";
  let headers: Record<string, string> = {};
  globalThis.fetch = (async (_url: string, init?: RequestInit) => {
    posted = String(init?.body ?? "");
    headers = Object.fromEntries(new Headers(init?.headers).entries());
    return new Response(JSON.stringify({
      content: [{ type: "text", text: `{"direction":"bullish","explanation":"Above VWAP.","driver_ids":["${ID_SIGNAL}"]}` }],
      usage: { input_tokens: 3, output_tokens: 4 },
    }), { status: 200 });
  }) as typeof fetch;
  try {
    const r = await makeAnthropicCaller(API_KEY).call("PROMPT", catalog);
    assertEquals(r.kind, "ok");
    if (r.kind === "ok") assertEquals(r.value.direction, "bullish");
  } finally {
    globalThis.fetch = original;
  }
  const body = JSON.parse(posted) as Record<string, unknown>;
  assertEquals(body.model, DEFAULT_ANTHROPIC_WATCHLIST_MODEL);
  assertEquals(body.max_tokens, 512);
  assertEquals(Object.keys(body).sort(), ["max_tokens", "messages", "model"]);
  assertEquals(body.messages, [{ role: "user", content: "PROMPT" }]);
  assertEquals(headers["x-api-key"], API_KEY);
  assertEquals(headers["anthropic-version"], "2023-06-01");
  assertEquals(headers["content-type"], "application/json");
  assert(!("temperature" in body));
  assert(!("top_p" in body));
  assert(!("tools" in body));
  assert(!("tool_choice" in body));
  assert(!("system" in body));
});

Deno.test("anthropic: HTTP 400 invalid_request_error is surfaced and is not success", async () => {
  const message = "messages.0: extra inputs are not permitted";
  const r = await callWithFetch(() => Promise.resolve(new Response(JSON.stringify({
    type: "error",
    error: { type: "invalid_request_error", message },
    request_id: "req_watchlist_400",
  }), { status: 400 })));
  assertEquals(r.kind, "transport_failure");
  if (r.kind !== "transport_failure") return;
  assertEquals(r.code, "PROVIDER_ERROR");
  assertEquals(r.http_status, 400);
  assertEquals(r.failure_kind, "http_error");
  assertEquals(r.provider_error_type, "invalid_request_error");
  assertEquals(r.provider_error_message, message);
});

Deno.test("anthropic: HTTP 400 message drops secrets", async () => {
  const r = await callWithFetch(() => Promise.resolve(new Response(JSON.stringify({
    type: "error",
    error: { type: "invalid_request_error", message: "rejected sk-ant-SECRET_KEY_VALUE" },
  }), { status: 400 })));
  const serialized = JSON.stringify(r);
  assert(!serialized.includes("SECRET_KEY_VALUE"));
  assert(!serialized.includes("sk-ant"));
});

Deno.test("radar context serializes inside the user prompt without extra API fields", () => {
  const prompt = buildAiPrompt({
    ticker: "AAPL", session_type: "rth", session_date: "2026-09-24",
    price: 10, change_pct: 1, volume: 100, rvol: 1.2, rvol_class: "normal",
    key_levels: { vwap: 10 }, market_signals: [], recent_events: [],
    reason_codes: ["radar_event:HOD_BREAK"],
    radar_context: {
      primary_event: "HOD_BREAK",
      primary_event_at: "2026-09-24T14:00:00.000Z",
      rvol_5m: 2.5,
      volume_velocity: 1.1,
      volume_acceleration_pct: null,
      distance_from_hod_pct: -0.4,
    },
  }, catalog);
  const body = buildWatchlistAnthropicBody(DEFAULT_ANTHROPIC_WATCHLIST_MODEL, prompt);
  const parsed = JSON.parse(JSON.stringify(body)) as {
    model: string;
    max_tokens: number;
    messages: Array<{ role: string; content: string }>;
  };
  assertEquals(Object.keys(parsed).sort(), ["max_tokens", "messages", "model"]);
  assertEquals(parsed.messages.length, 1);
  assertEquals(parsed.messages[0].role, "user");
  assert(parsed.messages[0].content.includes("HOD_BREAK"));
  assert(parsed.messages[0].content.includes('"volume_acceleration_pct":null'));
  assert(!parsed.messages[0].content.includes("undefined"));
});
