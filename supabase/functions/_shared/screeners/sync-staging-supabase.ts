/**
 * Postgres-backed staging store (requires migration 20261028200000).
 */

import {
  emptyChunkArtifacts,
  SCREENER_SYNC_JOB_TTL_MS,
  SCREENER_SYNC_LEASE_MS,
  type StagedGenerationJob,
} from "./sync-staging-types.ts";
import type { SyncStagingStore } from "./sync-staging-memory.ts";
import {
  jobFromRow,
  jobToInsertRow,
  jobToUpdateRow,
  type StagingJobRow,
} from "./sync-staging-serialize.ts";

export type StagingTableClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        gt: (
          col2: string,
          val2: string,
        ) => {
          limit: (n: number) => Promise<{
            data: Array<StagingJobRow | { id: string; created_at: string }> | null;
            error: { message: string; code?: string } | null;
          }>;
        };
        limit: (n: number) => Promise<{
          data: Array<StagingJobRow | { id: string; created_at: string }> | null;
          error: { message: string; code?: string } | null;
        }>;
      };
    };
    insert: (row: Record<string, unknown>) => Promise<{
      error: { message: string; code?: string } | null;
    }>;
    update: (row: Record<string, unknown>) => {
      eq: (col: string, val: string) => Promise<{
        error: { message: string; code?: string } | null;
      }>;
    };
  };
};

const TABLE = "screener_sync_generation_jobs";

function isMissingTable(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = error.message.toLowerCase();
  return (
    error.code === "42P01" ||
    msg.includes("does not exist") ||
    msg.includes("screener_sync_generation_jobs")
  );
}

export class SupabaseSyncStagingStore implements SyncStagingStore {
  constructor(private sb: StagingTableClient) {}

  async abortExpired(nowMs: number): Promise<number> {
    const cutoffMs = nowMs - SCREENER_SYNC_JOB_TTL_MS;
    const res = await this.sb
      .from(TABLE)
      .select("id,created_at")
      .eq("status", "chunking")
      .limit(32);
    if (res.error) {
      if (isMissingTable(res.error)) return 0;
      return 0;
    }
    let n = 0;
    for (const row of res.data ?? []) {
      const created = Date.parse(String(row.created_at ?? ""));
      if (!Number.isFinite(created) || created >= cutoffMs) continue;
      const upd = await this.sb
        .from(TABLE)
        .update({
          status: "aborted",
          lease_token: null,
          lease_expires_at: null,
        })
        .eq("id", String(row.id));
      if (!upd.error) n += 1;
    }
    return n;
  }

  async acquireOrCreate(
    input: Omit<
      StagedGenerationJob,
      "id" | "leaseToken" | "leaseExpiresMs" | "createdAtMs" | "updatedAtMs"
    >,
    leaseToken: string,
    nowMs: number,
  ): Promise<
    { ok: true; job: StagedGenerationJob } | { ok: false; reason: string }
  > {
    const leaseIso = new Date(nowMs).toISOString();
    const active = await this.sb
      .from(TABLE)
      .select("id,status,lease_expires_at")
      .eq("status", "chunking")
      .gt("lease_expires_at", leaseIso)
      .limit(1);
    if (active.error) {
      if (isMissingTable(active.error)) {
        return { ok: false, reason: "staging_table_missing" };
      }
      return { ok: false, reason: "staging_read_failed" };
    }
    if (active.data && active.data.length > 0) {
      return { ok: false, reason: "generation_in_progress" };
    }

    const id = crypto.randomUUID();
    const job: StagedGenerationJob = {
      ...input,
      id,
      merged: input.merged ?? emptyChunkArtifacts(),
      leaseToken,
      leaseExpiresMs: nowMs + SCREENER_SYNC_LEASE_MS,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
    };
    const ins = await this.sb.from(TABLE).insert(jobToInsertRow(job));
    if (ins.error) {
      if (isMissingTable(ins.error)) {
        return { ok: false, reason: "staging_table_missing" };
      }
      const msg = ins.error.message.toLowerCase();
      if (msg.includes("duplicate") || msg.includes("unique")) {
        return { ok: false, reason: "generation_in_progress" };
      }
      return { ok: false, reason: "staging_insert_failed" };
    }
    return { ok: true, job };
  }

  async get(id: string): Promise<StagedGenerationJob | null> {
    const res = await this.sb
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .limit(1);
    if (res.error || !res.data || res.data.length === 0) return null;
    return jobFromRow(res.data[0] as StagingJobRow);
  }

  async save(job: StagedGenerationJob): Promise<void> {
    job.updatedAtMs = Date.now();
    const res = await this.sb
      .from(TABLE)
      .update(jobToUpdateRow(job))
      .eq("id", job.id);
    if (res.error && !isMissingTable(res.error)) {
      throw new Error(`staging_save_failed: ${res.error.message}`);
    }
  }
}

export function createSupabaseSyncStagingStore(
  sb: StagingTableClient,
): SupabaseSyncStagingStore {
  return new SupabaseSyncStagingStore(sb);
}
