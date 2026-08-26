import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type DbClient, handleRadarWorkerBridge } from "./handler.ts";

serve(async (req) => {
  try {
    return await handleRadarWorkerBridge(req, {
      env: (k) => Deno.env.get(k) ?? undefined,
      createClient: (url, key) => createClient(url, key) as unknown as DbClient,
    });
  } catch (error) {
    console.error("[radar-worker-bridge] unexpected error");
    void error;
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
