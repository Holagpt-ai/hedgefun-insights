// sync-sec-edgar-filings — SEC EDGAR ingestion backbone (V1C paging + checkpoint).
// Server only. Bearer SYNC_SECRET. OPTIONS + POST only.
// Default mode is dry_run. Write requires SEC_EDGAR_WRITE_ENABLED=true.
// No cron wiring and no deployment behavior in this package.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleSyncSecEdgarFilings, type SecEdgarStore } from "./handler.ts";
import {
  normalizeAnchorAccessions,
  parseLoadedCheckpoint,
  SEC_EDGAR_STREAM_KEY,
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
          "stream_key,anchor_accessions,revision,anchor_observed_at,last_success_at,head_updated_at,pages_fetched",
        )
        .eq("stream_key", streamKey)
        .maybeSingle();
      if (error) return { ok: false, reason: "DATABASE_ERROR" };
      if (!data) return { ok: true, checkpoint: null };
      const parsed = parseLoadedCheckpoint(data);
      if (!parsed.ok) return { ok: false, reason: "CHECKPOINT_INCONSISTENT" };
      return { ok: true, checkpoint: parsed.checkpoint };
    },
    async saveCheckpoint(request) {
      const anchors = normalizeAnchorAccessions(request.nextCheckpoint.anchor_accessions);
      if (anchors === null) return { ok: false, reason: "CHECKPOINT_WRITE_FAILED" };
      const next = {
        ...request.nextCheckpoint,
        stream_key: SEC_EDGAR_STREAM_KEY,
        anchor_accessions: anchors,
      };
      if (request.expectedRevision === null) {
        const { error } = await supabase.from("sec_edgar_sync_state").insert({
          stream_key: SEC_EDGAR_STREAM_KEY,
          anchor_accessions: next.anchor_accessions,
          revision: 0,
          anchor_observed_at: next.anchor_observed_at,
          last_success_at: next.last_success_at,
          head_updated_at: next.head_updated_at,
          pages_fetched: next.pages_fetched,
          updated_at: next.last_success_at,
        });
        if (error) {
          if (error.code === "23505") {
            return { ok: false, reason: "CHECKPOINT_CONFLICT" };
          }
          return { ok: false, reason: "CHECKPOINT_WRITE_FAILED" };
        }
        return {
          ok: true,
          checkpoint: { ...next, stream_key: SEC_EDGAR_STREAM_KEY, revision: 0 },
        };
      }

      const { data, error } = await supabase
        .from("sec_edgar_sync_state")
        .update({
          anchor_accessions: next.anchor_accessions,
          revision: request.expectedRevision + 1,
          anchor_observed_at: next.anchor_observed_at,
          last_success_at: next.last_success_at,
          head_updated_at: next.head_updated_at,
          pages_fetched: next.pages_fetched,
          updated_at: next.last_success_at,
        })
        .eq("stream_key", SEC_EDGAR_STREAM_KEY)
        .eq("revision", request.expectedRevision)
        .select("revision");
      if (error) return { ok: false, reason: "CHECKPOINT_WRITE_FAILED" };
      if (!data || data.length === 0) {
        return { ok: false, reason: "CHECKPOINT_CONFLICT" };
      }
      return {
        ok: true,
        checkpoint: {
          ...next,
          stream_key: SEC_EDGAR_STREAM_KEY,
          revision: request.expectedRevision + 1,
        },
      };
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
      loadCheckpoint: async () => ({ ok: false as const, reason: "DATABASE_ERROR" as const }),
      saveCheckpoint: async () => ({ ok: false as const, reason: "CHECKPOINT_WRITE_FAILED" as const }),
    };

  return await handleSyncSecEdgarFilings(req, {
    env,
    fetchFn: fetch,
    store,
  });
});
