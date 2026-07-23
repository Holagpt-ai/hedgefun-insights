import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAlerts, parseManualBody, parseRunId, parseTriggerBody, selectMode,
} from "../../analyze-watchlist-tickers-v2/index.ts";
import type { MarketSignal, RecentEvent } from "./contract.ts";

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
  assertEquals(parseTriggerBody({ record: { symbol: "!!bad", user_id: uid } }).ok, false);
});

Deno.test("parseTriggerBody: non-uuid user_id rejected", () => {
  assertEquals(parseTriggerBody({ record: { symbol: "AAPL", user_id: "not-a-uuid" } }).ok, false);
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

Deno.test("parseRunId: absent when key missing or null/undefined/empty", () => {
  assertEquals(parseRunId({}).kind, "absent");
  assertEquals(parseRunId({ run_id: null }).kind, "absent");
  assertEquals(parseRunId({ run_id: undefined }).kind, "absent");
  assertEquals(parseRunId({ run_id: "" }).kind, "absent");
});

Deno.test("parseRunId: malformed for non-string or bad uuid", () => {
  assertEquals(parseRunId({ run_id: "not-a-uuid" }).kind, "malformed");
  assertEquals(parseRunId({ run_id: 5 }).kind, "malformed");
  assertEquals(parseRunId({ run_id: {} }).kind, "malformed");
});

Deno.test("parseRunId: valid uuid", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const r = parseRunId({ run_id: id });
  assertEquals(r.kind, "valid");
  if (r.kind === "valid") assertEquals(r.value, id);
});

// ── buildAlerts ─────────────────────────────────────────────────────────

const T = "AAPL";
const D = "2026-07-23";
const NOW_ISO = "2026-07-23T15:00:00Z";
const NOW_MS = Date.parse(NOW_ISO);

const baseAlertInput = {
  ticker: T, sessionDate: D, sessionType: "rth" as const,
  analyzedAtIso: NOW_ISO, analyzedAtMs: NOW_MS,
  marketSignals: [] as MarketSignal[],
  recentEvents: [] as RecentEvent[],
  rvol: null, rvolClass: null,
  direction: "bullish" as const, priorDirection: null, earningsDate: null,
};

Deno.test("buildAlerts: no direction_change on first analysis", () => {
  const alerts = buildAlerts({ ...baseAlertInput, priorDirection: null, direction: "bullish" });
  assert(!alerts.some((a) => a.alert_type === "direction_change"));
});

Deno.test("buildAlerts: no direction_change when prior equals new", () => {
  const alerts = buildAlerts({ ...baseAlertInput, priorDirection: "bullish", direction: "bullish" });
  assert(!alerts.some((a) => a.alert_type === "direction_change"));
});

Deno.test("buildAlerts: no direction_change involving data_unavailable", () => {
  const a1 = buildAlerts({ ...baseAlertInput, priorDirection: "data_unavailable", direction: "bullish" });
  const a2 = buildAlerts({ ...baseAlertInput, priorDirection: "bullish", direction: "data_unavailable" });
  assert(!a1.some((a) => a.alert_type === "direction_change"));
  assert(!a2.some((a) => a.alert_type === "direction_change"));
});

Deno.test("buildAlerts: emits direction_change with stable dedupe key", () => {
  const alerts = buildAlerts({ ...baseAlertInput, priorDirection: "neutral", direction: "bullish" });
  const dc = alerts.find((a) => a.alert_type === "direction_change");
  assert(dc);
  assertEquals(dc!.dedupe_key, `v2:direction_change:${T}:${D}:neutral->bullish`);
  assertEquals(dc!.facts.from, "neutral");
  assertEquals(dc!.facts.to, "bullish");
});

Deno.test("buildAlerts: rejects company_event older than 6h", () => {
  const oldIso = new Date(NOW_MS - 7 * 3600_000).toISOString();
  const events: RecentEvent[] = [{
    event_id: "e1", event_type: "news", title: "Old news",
    event_time: oldIso, source_name: "s", source_url: null,
    verification_state: "provider_reported", ingested_at: oldIso,
  }];
  const alerts = buildAlerts({ ...baseAlertInput, recentEvents: events });
  assert(!alerts.some((a) => a.alert_type === "company_event"));
});

Deno.test("buildAlerts: emits company_event within 6h", () => {
  const recentIso = new Date(NOW_MS - 3600_000).toISOString();
  const events: RecentEvent[] = [{
    event_id: "e1", event_type: "news", title: "Fresh news",
    event_time: recentIso, source_name: "s", source_url: null,
    verification_state: "provider_reported", ingested_at: recentIso,
  }];
  const alerts = buildAlerts({ ...baseAlertInput, recentEvents: events });
  const ce = alerts.find((a) => a.alert_type === "company_event");
  assert(ce);
  assertEquals(ce!.dedupe_key, `v2:company_event:${T}:${D}:e1`);
});

Deno.test("buildAlerts: earnings_upcoming within 3 days", () => {
  const inTwoDays = new Date(NOW_MS + 2 * 24 * 3600_000).toISOString().slice(0, 10);
  const alerts = buildAlerts({ ...baseAlertInput, earningsDate: inTwoDays });
  const eu = alerts.find((a) => a.alert_type === "earnings_upcoming");
  assert(eu);
});

Deno.test("buildAlerts: no earnings_upcoming beyond 3 days", () => {
  const inSixDays = new Date(NOW_MS + 6 * 24 * 3600_000).toISOString().slice(0, 10);
  const alerts = buildAlerts({ ...baseAlertInput, earningsDate: inSixDays });
  assert(!alerts.some((a) => a.alert_type === "earnings_upcoming"));
});

Deno.test("buildAlerts: never emits key_level", () => {
  const alerts = buildAlerts({ ...baseAlertInput });
  assert(!alerts.some((a) => a.alert_type === "key_level" as unknown));
});

Deno.test("buildAlerts: unusual_volume uses v2: prefixed dedupe", () => {
  const alerts = buildAlerts({ ...baseAlertInput, rvol: 3.5, rvolClass: "unusual" });
  const uv = alerts.find((a) => a.alert_type === "unusual_volume");
  assert(uv);
  assertEquals(uv!.dedupe_key, `v2:unusual_volume:${T}:${D}`);
});
