import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type DbClient, handleSyncScreener52wBaselines } from "./handler.ts";

serve(async (req) => {
  try {
    return await handleSyncScreener52wBaselines(req, {
      env: (k) => Deno.env.get(k) ?? undefined,
      fetch,
      createClient: (url, key) => createClient(url, key) as unknown as DbClient,
      nowIso: () => new Date().toISOString(),
    });
  } catch (e) {
    console.error("[sync-screener-52w-baselines] unexpected error");
    void e;
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
