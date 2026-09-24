import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchGenerateDailyBrief } from "./invoke-generator.ts";

Deno.test("generator invoke sends apikey and retries transient 502 once", async () => {
  let calls = 0;
  const res = await fetchGenerateDailyBrief({
    supabaseUrl: "https://example.supabase.co",
    syncSecret: "sync-secret",
    publishableKey: "publishable-key",
    body: { briefType: "am" },
    fetchImpl: (_url, init) => {
      calls += 1;
      const headers = init?.headers as Record<string, string> | undefined;
      assertEquals(headers?.apikey, "publishable-key");
      assertEquals(headers?.Authorization, "Bearer sync-secret");
      if (calls === 1) {
        return Promise.resolve(new Response(JSON.stringify({ error: "boot" }), { status: 502 }));
      }
      return Promise.resolve(
        new Response(JSON.stringify({ brief_type: "am", brief_date: "2026-09-24", cached: false }), {
          status: 200,
        }),
      );
    },
  });
  assertEquals(calls, 2);
  assertEquals(res.status, 200);
});
