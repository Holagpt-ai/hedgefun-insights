// sync-sec-edgar-filings — SEC EDGAR ingestion backbone (V1B activation controls).
// Server only. Bearer SYNC_SECRET. OPTIONS + POST only.
// Default mode is dry_run. Write requires SEC_EDGAR_WRITE_ENABLED=true.
// No cron wiring and no deployment behavior in this package.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleSyncSecEdgarFilings, type SecEdgarStore } from "./handler.ts";

type SbClient = ReturnType<typeof createClient<any, "public", any>>;

function createSupabaseStore(supabase: SbClient): SecEdgarStore {
  return {
    async findExistingDedupeKeys(dedupeKeys) {
      const found = new Set<string>();
      if (dedupeKeys.length === 0) return found;
      const chunkSize = 500;
      for (let i = 0; i < dedupeKeys.length; i += chunkSize) {
        const chunk = dedupeKeys.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from("catalyst_events")
          .select("dedupe_key")
          .in("dedupe_key", chunk);
        if (error) return null;
        for (const raw of (data ?? []) as Array<{ dedupe_key?: unknown }>) {
          if (typeof raw.dedupe_key === "string") found.add(raw.dedupe_key);
        }
      }
      return found;
    },
    async insertNewRows(rows) {
      if (rows.length === 0) return 0;
      let upserted = 0;
      const chunkSize = 200;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error, count } = await supabase
          .from("catalyst_events")
          .upsert(chunk as never[], { onConflict: "dedupe_key", count: "exact" });
        if (error) return null;
        upserted += typeof count === "number" ? count : chunk.length;
      }
      return upserted;
    },
  };
}

serve(async (req) => {
  const env = (key: string) => Deno.env.get(key);
  const supabaseUrl = env("SUPABASE_URL") ?? "";
  const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const store = supabaseUrl && serviceRole
    ? createSupabaseStore(createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    }))
    : {
      findExistingDedupeKeys: async () => new Set<string>(),
      insertNewRows: async () => null,
    };

  return await handleSyncSecEdgarFilings(req, {
    env,
    fetchFn: fetch,
    store,
  });
});
