import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migrationUrl = new URL(
  "../../../migrations/20260927200000_user_price_alerts_v1.sql",
  import.meta.url,
);

Deno.test("user price alerts migration defines RLS and ownership", async () => {
  const sql = await Deno.readTextFile(migrationUrl);
  assertEquals(sql.includes("user_price_alerts"), true);
  assertEquals(sql.includes("user_price_alert_triggers"), true);
  assertEquals(sql.includes("auth.uid() = user_id"), true);
  assertEquals(sql.includes("ENABLE ROW LEVEL SECURITY"), true);
});
