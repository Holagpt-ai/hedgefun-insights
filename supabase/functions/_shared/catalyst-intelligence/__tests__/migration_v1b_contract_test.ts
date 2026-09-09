import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const MIGRATION_REL = "../../../../migrations/20260909180000_catalyst_intelligence_v1b.sql";

Deno.test("V1B migration is additive, service-role only, and does not touch ingestion", async () => {
  const sql = await Deno.readTextFile(new URL(MIGRATION_REL, import.meta.url));
  assert(sql.includes("ALTER TABLE public.catalyst_intelligence"));
  assert(sql.includes("rules_version"));
  assert(sql.includes("evidence_as_of"));
  assert(sql.includes("market_context_as_of"));
  assert(sql.includes("catalyst_intelligence_event_rules_key"));
  assert(!/CREATE TABLE/i.test(sql));
  assert(!/cron\.schedule/i.test(sql));
  assert(!/ALTER TABLE public\.catalyst_events/i.test(sql));
  assert(!/sec_edgar_sync_state/i.test(sql));
  assert(sql.includes("REVOKE ALL ON TABLE public.catalyst_intelligence FROM anon"));
  assert(sql.includes("GRANT ALL ON TABLE public.catalyst_intelligence TO service_role"));
  assertEquals(/GRANT .+ TO anon/i.test(sql), false);
});
