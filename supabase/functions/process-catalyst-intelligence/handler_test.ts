import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleProcessCatalystIntelligence, type HandlerDeps } from "./handler.ts";
import type { ProcessorStore } from "../_shared/catalyst-intelligence/processor.ts";
import { occScheduledEarnings } from "../_shared/catalyst-intelligence/__tests__/fixtures.ts";
import type { CatalystEventRow } from "../_shared/catalyst-intelligence/select.ts";

const SYNC_SECRET = "test-sync-secret";

function occRow(): CatalystEventRow {
  const input = occScheduledEarnings();
  return {
    id: input.id!,
    dedupe_key: input.dedupe_key,
    symbol: input.symbol,
    company_name: input.company_name ?? null,
    event_type: input.event_type,
    verification_state: input.verification_state ?? null,
    event_date: input.event_date,
    event_time: input.event_time ?? null,
    time_of_day: input.time_of_day ?? null,
    title: input.title,
    description: input.description ?? null,
    source_name: input.source_name,
    source_url: input.source_url ?? null,
    provider: input.provider,
    provider_article_id: input.provider_article_id ?? null,
    related_symbols: input.related_symbols ?? [],
    facts: input.facts ?? {},
    published_at: input.published_at ?? null,
    created_at: input.created_at ?? null,
  };
}

function envMap(extra: Record<string, string | undefined> = {}) {
  const base: Record<string, string | undefined> = {
    SYNC_SECRET,
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role",
    CATALYST_INTELLIGENCE_ENABLED: "true",
    CATALYST_INTELLIGENCE_WRITE_ENABLED: extra.CATALYST_INTELLIGENCE_WRITE_ENABLED,
    CATALYST_ALERT_GENERATION_ENABLED: "true",
    ALERT_DELIVERY_ENABLED: "false",
    ...extra,
  };
  return (key: string) => base[key];
}

function trackingStore(): ProcessorStore & { writes: string[] } {
  const writes: string[] = [];
  return {
    writes,
    async loadCatalystEvents() {
      return [occRow()];
    },
    async findIntelligenceIdentity() {
      return false;
    },
    async insertIntelligence() {
      writes.push("catalyst_intelligence");
      return { ok: true, id: "intel-1" };
    },
    async findAlertDedupe() {
      return false;
    },
    async insertAlert() {
      writes.push("alert_events");
      return { ok: true };
    },
  };
}

async function post(body: string, deps: HandlerDeps, auth = `Bearer ${SYNC_SECRET}`): Promise<Response> {
  return await handleProcessCatalystIntelligence(
    new Request("http://localhost/process-catalyst-intelligence", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body,
    }),
    deps,
  );
}

Deno.test("write mode refuses without valid secret", async () => {
  const store = trackingStore();
  const res = await post('{"mode":"write"}', {
    env: envMap({ CATALYST_INTELLIGENCE_WRITE_ENABLED: "true" }),
    store,
  }, "Bearer wrong");
  assertEquals(res.status, 403);
  assertEquals(await res.json(), { error: "AUTH_FAILED" });
  assertEquals(store.writes.length, 0);
});

Deno.test("write mode refuses without exact write flag", async () => {
  const store = trackingStore();
  const res = await post('{"mode":"write"}', {
    env: envMap({ CATALYST_INTELLIGENCE_WRITE_ENABLED: "TRUE" }),
    store,
  });
  assertEquals(res.status, 409);
  assertEquals(await res.json(), { error: "INTELLIGENCE_WRITES_DISABLED" });
  assertEquals(store.writes.length, 0);
});

Deno.test("dry_run returns telemetry and performs zero writes", async () => {
  const store = trackingStore();
  const res = await post('{"mode":"dry_run"}', { env: envMap(), store });
  assertEquals(res.status, 200);
  const json = await res.json() as { telemetry: { mode: string; writes_attempted: number; catalyst_events_writes: number } };
  assertEquals(json.telemetry.mode, "dry_run");
  assertEquals(json.telemetry.writes_attempted, 0);
  assertEquals(json.telemetry.catalyst_events_writes, 0);
  assertEquals(store.writes.length, 0);
});

Deno.test("processor source reads catalyst_events and never writes them", async () => {
  const indexSrc = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const handlerSrc = await Deno.readTextFile(new URL("./handler.ts", import.meta.url));
  assertEquals(/from\("catalyst_events"\)/.test(indexSrc), true);
  assertEquals(/from\("catalyst_events"\)[\s\S]{0,80}\.(insert|update|upsert)/.test(indexSrc), false);
  assertEquals(/from\("catalyst_events"\)/.test(handlerSrc), false);
});

Deno.test("write telemetry records persist attempts when flags allow", async () => {
  const store = trackingStore();
  const res = await post('{"mode":"write"}', {
    env: envMap({ CATALYST_INTELLIGENCE_WRITE_ENABLED: "true" }),
    store,
  });
  assertEquals(res.status, 200);
  const json = await res.json() as { telemetry: { mode: string; writes_attempted: number } };
  assertEquals(json.telemetry.mode, "write");
  assertEquals(json.telemetry.writes_attempted >= 1, true);
  assertEquals(store.writes.includes("catalyst_intelligence"), true);
  assertEquals(store.writes.includes("catalyst_events"), false);
});
