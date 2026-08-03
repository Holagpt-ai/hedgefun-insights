import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type DbClient, handleSyncIndexes } from "./handler.ts";

serve(async (req) => {
  return await handleSyncIndexes(req, {
    env: (k) => Deno.env.get(k) ?? undefined,
    fetch,
    createClient: (url, key) => createClient(url, key) as unknown as DbClient,
    nowIso: () => new Date().toISOString(),
  });
});
