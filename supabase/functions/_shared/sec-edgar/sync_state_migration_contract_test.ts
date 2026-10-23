import { assert, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";

const MIGRATION_REL = "../../../migrations/20260907180000_sec_edgar_sync_state_v1.sql";

Deno.test("sec_edgar_sync_state migration is service-role only and does not schedule cron", async () => {
  const sql = (await Deno.readTextFile(new URL(MIGRATION_REL, import.meta.url)))
    .replaceAll("\r\n", "\n");
  assert(sql.includes("CREATE TABLE IF NOT EXISTS public.sec_edgar_sync_state"));
  assert(sql.includes("stream_key text PRIMARY KEY"));
  assert(sql.includes("anchor_accessions jsonb"));
  assert(sql.includes("revision bigint NOT NULL DEFAULT 0"));
  assert(sql.includes("CHECK (revision >= 0)"));
  assert(sql.includes("jsonb_array_length(anchor_accessions) BETWEEN 1 AND 100"));
  assert(sql.includes("ENABLE ROW LEVEL SECURITY"));
  assert(sql.includes("REVOKE ALL ON TABLE public.sec_edgar_sync_state FROM PUBLIC"));
  assert(sql.includes("REVOKE ALL ON TABLE public.sec_edgar_sync_state FROM anon"));
  assert(sql.includes("REVOKE ALL ON TABLE public.sec_edgar_sync_state FROM authenticated"));
  assert(sql.includes("GRANT ALL ON TABLE public.sec_edgar_sync_state TO service_role"));
  assertFalse(sql.includes("cron.schedule"));
  assertFalse(sql.includes("CREATE POLICY"));
  assertFalse(sql.includes("GRANT SELECT"));
});

const GATE_I_MIGRATION_REL = "../../../migrations/20261024103000_sec_edgar_recurring_ingestion_v1.sql";

Deno.test("Gate I recurring ingestion migration adds lease, runs, pause counters, no cron", async () => {
  const sql = (await Deno.readTextFile(new URL(GATE_I_MIGRATION_REL, import.meta.url)))
    .replaceAll("\r\n", "\n");
  assert(sql.includes("sec_edgar_sync_lease"));
  assert(sql.includes("sec_edgar_sync_runs"));
  assert(sql.includes("consecutive_failures"));
  assert(sql.includes("ingestion_paused"));
  assert(sql.includes("try_acquire_sec_edgar_sync_lease_v1"));
  assert(sql.includes("REVOKE ALL ON FUNCTION public.try_acquire_sec_edgar_sync_lease_v1"));
  assert(sql.includes("GRANT EXECUTE ON FUNCTION public.try_acquire_sec_edgar_sync_lease_v1"));
  assertFalse(sql.includes("cron.schedule"));
});
