import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const MIGRATION_REL = "../../../../migrations/20260908180000_catalyst_intelligence_v1.sql";

async function loadMigration(): Promise<string> {
  return await Deno.readTextFile(new URL(MIGRATION_REL, import.meta.url));
}

Deno.test("migration creates intelligence and alert_events only", async () => {
  const sql = await loadMigration();
  const tables = [...sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z_]+)/g)].map(
    (m) => m[1],
  );
  assertEquals(tables, ["catalyst_intelligence", "alert_events"]);
});

Deno.test("migration is service-role only and does not schedule cron or delivery", async () => {
  const sql = await loadMigration();
  assert(!/cron\.schedule/i.test(sql), "no cron");
  assert(!/twilio/i.test(sql), "no twilio");
  assert(!/onesignal/i.test(sql), "no onesignal");
  assert(!/net\.http_post/i.test(sql), "no http dispatch");
  assert(sql.includes("GRANT ALL ON TABLE public.catalyst_intelligence TO service_role"));
  assert(sql.includes("GRANT ALL ON TABLE public.alert_events TO service_role"));
  assert(sql.includes("REVOKE ALL ON TABLE public.catalyst_intelligence FROM anon"));
  assert(sql.includes("REVOKE ALL ON TABLE public.alert_events FROM authenticated"));
  assert(sql.includes("sec_filing_news remains unchanged"));
});

Deno.test("module source has no delivery SDKs or provider adapter I/O", async () => {
  const root = new URL("..", import.meta.url);
  const forbidden = /twilio|onesignal|nodemailer|sendgrid|postmark|resend/i;
  for await (const entry of Deno.readDir(root)) {
    if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
    const text = await Deno.readTextFile(new URL(entry.name, root));
    const imports = [...text.matchAll(/^\s*import\s+.+from\s+["']([^"']+)["']/gm)]
      .map((m) => m[1])
      .join("\n");
    assert(!forbidden.test(imports), `${entry.name} must not import delivery SDKs`);
    if (entry.name === "adapters.ts") {
      assert(text.includes("PROVIDER_ADAPTERS_DISABLED_IN_V1"));
      assert(!/fetch\s*\(/.test(text), "adapters must not fetch");
    }
  }
});
