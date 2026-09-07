// sync-sec-edgar-filings — SEC EDGAR ingestion backbone (V1C paging + checkpoint).
// Server only. Bearer SYNC_SECRET. OPTIONS + POST only.
// Default mode is dry_run. Write requires SEC_EDGAR_WRITE_ENABLED=true.
// No cron wiring and no deployment behavior in this package.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleSyncSecEdgarFilings, type SecEdgarStore } from "./handler.ts";
import {
  normalizeAnchorAccessions,
  SEC_EDGAR_STREAM_KEY,
  type SecEdgarCheckpoint,
} from "../_shared/sec-edgar/checkpoint.ts";

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
    async loadCheckpoint(streamKey) {
      const { data, error } = await supabase
        .from("sec_edgar_sync_state")
        .select(
          "stream_key,anchor_accessions,anchor_observed_at,last_success_at,head_updated_at,pages_fetched",
        )
        .eq("stream_key", streamKey)
        .maybeSingle();
      if (error) return { ok: false };
      if (!data) return { ok: true, checkpoint: null };
      const anchors = normalizeAnchorAccessions(data.anchor_accessions);
      if (anchors === null) return { ok: true, checkpoint: { ...data, anchor_accessions: ["invalid"] } as SecEdgarCheckpoint };
      const checkpoint: SecEdgarCheckpoint = {
        stream_key: typeof data.stream_key === "string" ? data.stream_key : SEC_EDGAR_STREAM_KEY,
        anchor_accessions: anchors,
        anchor_observed_at: typeof data.anchor_observed_at === "string" ? data.anchor_observed_at : "",
        last_success_at: typeof data.last_success_at === "string" ? data.last_success_at : "",
        head_updated_at: typeof data.head_updated_at === "string" ? data.head_updated_at : null,
        pages_fetched: typeof data.pages_fetched === "number" ? data.pages_fetched : 0,
      };
      return { ok: true, checkpoint };
    },
    async saveCheckpoint(checkpoint) {
      const { error } = await supabase
        .from("sec_edgar_sync_state")
        .upsert({
          stream_key: checkpoint.stream_key,
          anchor_accessions: checkpoint.anchor_accessions,
          anchor_observed_at: checkpoint.anchor_observed_at,
          last_success_at: checkpoint.last_success_at,
          head_updated_at: checkpoint.head_updated_at,
          pages_fetched: checkpoint.pages_fetched,
          updated_at: checkpoint.last_success_at,
        }, { onConflict: "stream_key" });
      return !error;
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
      loadCheckpoint: async () => ({ ok: false as const }),
      saveCheckpoint: async () => false,
    };

  return await handleSyncSecEdgarFilings(req, {
    env,
    fetchFn: fetch,
    store,
  });
});
