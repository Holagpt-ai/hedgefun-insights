import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildEvidenceCatalog, validateAiOutput } from "./ai-read.ts";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_WATCHLIST_AI_PROVIDER,
  WATCHLIST_AI_FALLBACK_ENABLED,
  WATCHLIST_AI_MAX_REPAIR_RETRIES,
  createAnthropicAdapter,
  createWatchlistAiAdapter,
  generateWatchlistAnalysis,
  resolveWatchlistAiConfig,
  type WatchlistAiAdapter,
  type WatchlistAiRawComplete,
} from "./ai-provider.ts";

const catalog = buildEvidenceCatalog({
  market_signals: [
    {
      signal_id: "s1", label: "l", category: "trend", kind: "state",
      direction: "bullish", facts: {}, inputs: [], observed_at: "2026-07-23T10:00:00Z",
      rule_version: "w2b1c.1",
    },
  ] as never,
  recent_events: [],
  key_levels: { vwap: 100, hod: null, basis: { hod_lod_scope: "rth", vwap_scope: "rth" } },
  metrics: ["rvol"],
});

const VALID_JSON = `{"direction":"bullish","explanation":"Held above VWAP with elevated volume.","driver_ids":["signal:s1"]}`;

function fakeAdapter(
  id: "anthropic" | "qwen",
  complete: WatchlistAiAdapter["complete"],
): WatchlistAiAdapter {
  return { id, model: id === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : "unused", complete };
}

Deno.test("default config selects Anthropic Haiku and keeps fallback off", () => {
  const cfg = resolveWatchlistAiConfig({ ANTHROPIC_API_KEY: "sk-ant-test" });
  assertEquals(cfg.provider, DEFAULT_WATCHLIST_AI_PROVIDER);
  assertEquals(cfg.provider, "anthropic");
  assertEquals(cfg.model, DEFAULT_ANTHROPIC_MODEL);
  assertEquals(cfg.model, "claude-haiku-4-5-20251001");
  assertEquals(cfg.fallbackEnabled, false);
  assertEquals(WATCHLIST_AI_FALLBACK_ENABLED, false);
  assertEquals(WATCHLIST_AI_MAX_REPAIR_RETRIES, 1);
  const created = createWatchlistAiAdapter(cfg);
  assertEquals(created.ok, true);
  if (created.ok) assertEquals(created.adapter.id, "anthropic");
});

Deno.test("empty env without Qwen secrets still resolves to Anthropic", () => {
  const cfg = resolveWatchlistAiConfig({});
  assertEquals(cfg.provider, "anthropic");
  assertEquals(cfg.model, DEFAULT_ANTHROPIC_MODEL);
  const created = createWatchlistAiAdapter(cfg);
  assertEquals(created.ok, false);
  if (!created.ok) assertEquals(created.reason, "missing_anthropic_key");
});

Deno.test("leftover Qwen env does not change the active Anthropic provider or model", () => {
  const cfg = resolveWatchlistAiConfig({
    WATCHLIST_AI_PROVIDER: "anthropic",
    WATCHLIST_AI_MODEL: "qwen-flash-us",
    QWEN_API_KEY: "should-be-ignored",
    QWEN_BASE_URL: "https://example.invalid",
    ANTHROPIC_API_KEY: "sk-ant-test",
  });
  assertEquals(cfg.provider, "anthropic");
  assertEquals(cfg.model, DEFAULT_ANTHROPIC_MODEL);
  const created = createWatchlistAiAdapter(cfg);
  assertEquals(created.ok, true);
  if (created.ok) assertEquals(created.adapter.model, DEFAULT_ANTHROPIC_MODEL);
});

Deno.test("explicit Qwen provider is disabled and does not construct a Qwen caller", () => {
  const cfg = resolveWatchlistAiConfig({
    WATCHLIST_AI_PROVIDER: "qwen",
    ANTHROPIC_API_KEY: "sk-ant-present",
  });
  assertEquals(cfg.provider, "qwen");
  const created = createWatchlistAiAdapter(cfg);
  assertEquals(created.ok, false);
  if (!created.ok) assertEquals(created.reason, "provider_disabled");
});

Deno.test("WATCHLIST_AI_FALLBACK=on still does not enable another provider", () => {
  const cfg = resolveWatchlistAiConfig({
    WATCHLIST_AI_PROVIDER: "anthropic",
    ANTHROPIC_API_KEY: "sk-ant-test",
    WATCHLIST_AI_FALLBACK: "on",
  });
  assertEquals(cfg.fallbackEnabled, false);
  assertEquals(cfg.fallbackRequested, true);
  const created = createWatchlistAiAdapter(cfg);
  assertEquals(created.ok, true);
  if (created.ok) assertEquals(created.adapter.id, "anthropic");
});

Deno.test("Anthropic adapter produces normalized valid Watchlist output", async () => {
  const adapter = fakeAdapter("anthropic", async () => ({
    kind: "ok",
    rawText: VALID_JSON,
    usage: { input_tokens: 200, output_tokens: 50 },
    http_status: 200,
  }));
  const r = await generateWatchlistAnalysis(adapter, { prompt: "facts", catalog });
  assertEquals(r.kind, "ok");
  if (r.kind !== "ok") return;
  assertEquals(r.value.direction, "bullish");
  assertEquals(r.value.driver_ids, ["signal:s1"]);
  assertEquals(r.meta.provider, "anthropic");
  assertEquals(r.meta.model, DEFAULT_ANTHROPIC_MODEL);
  assertEquals(r.meta.retry_count, 0);
  assertEquals(r.meta.usage.input_tokens, 200);
  assertEquals(r.meta.fallback, "off");
  assertEquals(validateAiOutput(JSON.stringify(r.value), catalog).kind, "ok");
});

Deno.test("malformed Anthropic response is rejected and does not fabricate analysis", async () => {
  const adapter = fakeAdapter("anthropic", async () => ({ kind: "ok", rawText: "not json", http_status: 200 }));
  const r = await generateWatchlistAnalysis(adapter, { prompt: "facts", catalog });
  assertEquals(r.kind, "validation_failed");
  if (r.kind === "validation_failed") assertEquals(r.reason, "unparseable_json");
  assertEquals(r.meta.retry_count, 1);
});

Deno.test("malformed Anthropic response retries at most once", async () => {
  let calls = 0;
  const adapter = fakeAdapter("anthropic", async () => {
    calls += 1;
    return { kind: "ok", rawText: `{"direction":"nope"}`, http_status: 200 };
  });
  const r = await generateWatchlistAnalysis(adapter, { prompt: "facts", catalog });
  assertEquals(calls, 2);
  assertEquals(r.kind, "validation_failed");
  if (r.kind === "validation_failed") assertEquals(r.reason, "bad_direction");
});

Deno.test("Anthropic failure does not invoke another provider", async () => {
  let anthropicCalls = 0;
  let otherCalls = 0;
  const anthropic = fakeAdapter("anthropic", async () => {
    anthropicCalls += 1;
    return {
      kind: "transport_failure",
      code: "PROVIDER_ERROR",
      http_status: 500,
      failure_kind: "http_error",
    };
  });
  const other: WatchlistAiAdapter = fakeAdapter("qwen", async (): Promise<WatchlistAiRawComplete> => {
    otherCalls += 1;
    return { kind: "ok", rawText: VALID_JSON };
  });
  const r = await generateWatchlistAnalysis(anthropic, { prompt: "facts", catalog });
  assertEquals(r.kind, "transport_failure");
  assertEquals(anthropicCalls, 1);
  assertEquals(otherCalls, 0);
  void other;
});

Deno.test("first malformed Anthropic output can be repaired on the single allowed retry", async () => {
  let calls = 0;
  const adapter = fakeAdapter("anthropic", async () => {
    calls += 1;
    if (calls === 1) return { kind: "ok", rawText: "not json", http_status: 200 };
    return { kind: "ok", rawText: VALID_JSON, http_status: 200 };
  });
  const r = await generateWatchlistAnalysis(adapter, { prompt: "facts", catalog });
  assertEquals(calls, 2);
  assertEquals(r.kind, "ok");
  if (r.kind === "ok") assertEquals(r.meta.retry_count, 1);
});

Deno.test("createAnthropicAdapter uses the existing Haiku model id", () => {
  const adapter = createAnthropicAdapter({
    apiKey: "sk-ant-test",
    model: DEFAULT_ANTHROPIC_MODEL,
  });
  assertEquals(adapter.id, "anthropic");
  assertEquals(adapter.model, "claude-haiku-4-5-20251001");
});

Deno.test("factory source does not import the dormant Qwen adapter", async () => {
  const factory = await Deno.readTextFile(new URL("./ai-provider.ts", import.meta.url));
  const analyzer = await Deno.readTextFile(
    new URL("../../analyze-watchlist-tickers-v2/index.ts", import.meta.url),
  );
  assert(!factory.includes('from "./ai-provider-qwen'));
  assert(!factory.includes("createDormantQwenAdapter"));
  assert(!factory.includes("createQwenAdapter"));
  assert(!analyzer.includes("QWEN_API_KEY"));
  assert(!analyzer.includes("QWEN_BASE_URL"));
  assert(!analyzer.includes("ai-provider-qwen"));
});
