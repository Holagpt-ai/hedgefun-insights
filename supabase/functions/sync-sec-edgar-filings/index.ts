// sync-sec-edgar-filings — SEC EDGAR ingestion backbone (V1C paging + checkpoint).
// Gate I: lease, run history, pause/failure counters on sec_edgar_sync_state.
// Server only. Bearer SYNC_SECRET. OPTIONS + POST only.
// Default mode is dry_run. Write requires SEC_EDGAR_WRITE_ENABLED=true.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleSyncSecEdgarFilings, type SecEdgarStore } from "./handler.ts";
import {
  normalizeAnchorAccessions,
  parseLoadedCheckpoint,
  SEC_EDGAR_STREAM_KEY,
} from "../_shared/sec-edgar/checkpoint.ts";
import type { SecRunRecord } from "../_shared/sec-edgar/run-telemetry.ts";

type SbClient = ReturnType<typeof createClient<any, "public", any>>;

function createSupabaseStore(supabase: SbClient): SecEdgarStore {
  return {
    async findExistingDedupeKeys(dedupeKeys) {
      const found = new Map<string, string>();
      if (dedupeKeys.length === 0) return found;
      const chunkSize = 500;
      for (let i = 0; i < dedupeKeys.length; i += chunkSize) {
        const chunk = dedupeKeys.slice(i, i + chunkSize);
        const { data, error } = await supabase
          .from("catalyst_events")
          .select("dedupe_key, verification_state")
          .in("dedupe_key", chunk);
        if (error) return null;
        for (const raw of (data ?? []) as Array<{ dedupe_key?: unknown; verification_state?: unknown }>) {
          if (typeof raw.dedupe_key === "string" && typeof raw.verification_state === "string") {
            found.set(raw.dedupe_key, raw.verification_state);
          }
        }
      }
      return found;
    },
    async insertNewRows(rows) {
      if (rows.length === 0) return 0;
      let inserted = 0;
      const chunkSize = 200;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error, count } = await supabase
          .from("catalyst_events")
          .upsert(chunk as never[], {
            onConflict: "dedupe_key",
            ignoreDuplicates: true,
            count: "exact",
          });
        if (error) return null;
        inserted += typeof count === "number" ? count : 0;
      }
      return inserted;
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
    async tryAcquireLease(holderId, ttlSeconds) {
      const { data, error } = await supabase.rpc("try_acquire_sec_edgar_sync_lease_v1", {
        p_stream_key: SEC_EDGAR_STREAM_KEY,
        p_holder_id: holderId,
        p_ttl_seconds: ttlSeconds,
      });
      if (error) return null;
      return data === true;
    },
    async releaseLease(holderId) {
      await supabase.rpc("release_sec_edgar_sync_lease_v1", {
        p_stream_key: SEC_EDGAR_STREAM_KEY,
        p_holder_id: holderId,
      });
    },
    async loadSyncControl() {
      const { data, error } = await supabase
        .from("sec_edgar_sync_state")
        .select("consecutive_failures, ingestion_paused, failure_pause_threshold, last_success_at")
        .eq("stream_key", SEC_EDGAR_STREAM_KEY)
        .maybeSingle();
      if (error) return null;
      if (!data) {
        return {
          consecutive_failures: 0,
          ingestion_paused: false,
          failure_pause_threshold: 3,
          last_success_at: null,
        };
      }
      const row = data as {
        consecutive_failures?: unknown;
        ingestion_paused?: unknown;
        failure_pause_threshold?: unknown;
        last_success_at?: unknown;
      };
      const cf = typeof row.consecutive_failures === "number" && row.consecutive_failures >= 0
        ? Math.floor(row.consecutive_failures)
        : 0;
      const threshold = typeof row.failure_pause_threshold === "number" &&
          row.failure_pause_threshold >= 1 && row.failure_pause_threshold <= 20
        ? Math.floor(row.failure_pause_threshold)
        : 3;
      return {
        consecutive_failures: cf,
        ingestion_paused: row.ingestion_paused === true,
        failure_pause_threshold: threshold,
        last_success_at: typeof row.last_success_at === "string" ? row.last_success_at : null,
      };
    },
    async recordSyncRun(record: SecRunRecord) {
      const { error } = await supabase.from("sec_edgar_sync_runs").insert({
        id: record.run_id,
        stream_key: record.stream_key,
        mode: record.mode,
        status: record.status,
        started_at: record.started_at,
        finished_at: record.finished_at,
        duration_ms: record.duration_ms,
        error_code: record.error_code,
        summary: record.summary,
      });
      if (error) {
        console.error("[sec-edgar-sync] sec_edgar_sync_runs insert failed");
      }
    },
    async noteSyncRunOutcome(success) {
      const { data, error } = await supabase.rpc("apply_sec_edgar_sync_run_outcome_v1", {
        p_stream_key: SEC_EDGAR_STREAM_KEY,
        p_success: success,
      });
      if (error || !data || typeof data !== "object") return null;
      const row = data as Record<string, unknown>;
      return {
        consecutive_failures: typeof row.consecutive_failures === "number"
          ? Math.floor(row.consecutive_failures)
          : 0,
        ingestion_paused: row.ingestion_paused === true,
        auto_pause_applied: row.auto_pause_applied === true,
      };
    },
  };
}

serve(async (req) => {
  const env = (key: string) => Deno.env.get(key);
  const supabaseUrl = env("SUPABASE_URL") ?? "";
  const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    return new Response(JSON.stringify({ error: "VALIDATION_ERROR" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
  const store = createSupabaseStore(createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  }));

  return await handleSyncSecEdgarFilings(req, {
    env,
    fetchFn: fetch,
    store,
  });
});
