/**
 * Postgres-backed staging store (migrations 20261028200000 + 20261028210000).
 */

import {
  emptyChunkArtifacts,
  SCREENER_SYNC_JOB_TTL_MS,
  SCREENER_SYNC_LEASE_MS,
  type StagedChunkArtifacts,
  type StagedGenerationJob,
} from "./sync-staging-types.ts";
import type { SyncStagingStore } from "./sync-staging-memory.ts";
import {
  jobFromRow,
  jobToInsertRow,
  serializeMergedArtifacts,
  type StagingJobRow,
} from "./sync-staging-serialize.ts";

export type StagingTableClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        gt?: (
          col2: string,
          val2: string,
        ) => {
          limit: (n: number) => Promise<StagingQueryResult>;
        };
        in?: (
          col2: string,
          vals: string[],
        ) => {
          limit: (n: number) => Promise<StagingQueryResult>;
        };
        limit: (n: number) => Promise<StagingQueryResult>;
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
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
};

type StagingQueryResult = {
  data: Array<StagingJobRow | { id: string; created_at: string }> | null;
  error: { message: string; code?: string } | null;
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

function isMissingRpc(error: { message: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("could not find the function") ||
    msg.includes("claim_screener_sync") ||
    msg.includes("advance_screener_sync");
}

function parseRpcJob(data: unknown): StagedGenerationJob | null {
  if (!data || typeof data !== "object") return null;
  const o = data as { ok?: boolean; job?: StagingJobRow; reason?: string };
  if (o.ok === true && o.job) return jobFromRow(o.job);
  return null;
}

export class SupabaseSyncStagingStore implements SyncStagingStore {
  constructor(private sb: StagingTableClient) {}

  async abortExpired(nowMs: number): Promise<number> {
    const nowIso = new Date(nowMs).toISOString();
    const ttlMinutes = Math.round(SCREENER_SYNC_JOB_TTL_MS / 60_000);
    const rpc = await this.sb.rpc("expire_screener_sync_stale_jobs_v1", {
      p_now: nowIso,
      p_job_ttl: `${ttlMinutes} minutes`,
    });
    if (!rpc.error) {
      const parsed = rpc.data as { ok?: boolean; aborted_count?: number };
      if (parsed?.ok && typeof parsed.aborted_count === "number") {
        return parsed.aborted_count;
      }
    }
    if (!isMissingRpc(rpc.error)) return 0;
    const cutoffMs = nowMs - SCREENER_SYNC_JOB_TTL_MS;
    let n = 0;
    for (const status of ["chunking", "finalizing"] as const) {
      const res = await this.sb
        .from(TABLE)
        .select("id,created_at")
        .eq("status", status)
        .limit(32);
      if (res.error) continue;
      for (const row of res.data ?? []) {
        const created = Date.parse(String(row.created_at ?? ""));
        if (!Number.isFinite(created) || created >= cutoffMs) continue;
        const upd = await this.sb
          .from(TABLE)
          .update({
            status: "aborted",
            lease_token: null,
            lease_expires_at: null,
            finalize_lease_token: null,
            finalize_lease_expires_at: null,
          })
          .eq("id", String(row.id));
        if (!upd.error) n += 1;
      }
    }
    return n;
  }

  async findResumableJob(nowMs: number): Promise<StagedGenerationJob | null> {
    const res = await this.sb
      .from(TABLE)
      .select("*")
      .eq("status", "chunking")
      .limit(8);
    if (res.error || !res.data) return null;
    const cutoffMs = nowMs - SCREENER_SYNC_JOB_TTL_MS;
    let best: StagedGenerationJob | null = null;
    for (const row of res.data as StagingJobRow[]) {
      const job = jobFromRow(row);
      if (job.status !== "chunking" && job.status !== "finalizing") continue;
      if (job.createdAtMs < cutoffMs) continue;
      const leaseExpired = job.leaseExpiresMs === null ||
        job.leaseExpiresMs <= nowMs;
      const dispatchFailed = !!job.continueLastError;
      if (!leaseExpired && !dispatchFailed) continue;
      if (!best || job.createdAtMs > best.createdAtMs) best = job;
    }
    if (!best) {
      const fin = await this.sb
        .from(TABLE)
        .select("*")
        .eq("status", "finalizing")
        .limit(4);
      for (const row of fin.data ?? [] as StagingJobRow[]) {
        const job = jobFromRow(row as StagingJobRow);
        if (job.createdAtMs < cutoffMs) continue;
        if (!best || job.createdAtMs > best.createdAtMs) best = job;
      }
    }
    return best;
  }

  async acquireOrCreate(
    input: Omit<
      StagedGenerationJob,
      | "id"
      | "leaseToken"
      | "leaseExpiresMs"
      | "createdAtMs"
      | "updatedAtMs"
      | "stateVersion"
      | "continueLastAtMs"
      | "continueLastError"
      | "finalizeLeaseToken"
      | "finalizeLeaseExpiresMs"
      | "publishRowsInserted"
      | "publishRpcRecordedAtMs"
      | "abortReason"
      | "abortEvidence"
    >,
    leaseToken: string,
    nowMs: number,
  ): Promise<
    { ok: true; job: StagedGenerationJob } | { ok: false; reason: string }
  > {
    const leaseIso = new Date(nowMs).toISOString();
    const active = await this.sb
      .from(TABLE)
      .select("id,status,lease_expires_at,finalize_lease_expires_at")
      .eq("status", "chunking")
      .limit(16);
    if (active.error) {
      if (isMissingTable(active.error)) {
        return { ok: false, reason: "staging_table_missing" };
      }
      return { ok: false, reason: "staging_read_failed" };
    }
    const finalizing = await this.sb
      .from(TABLE)
      .select("id")
      .eq("status", "finalizing")
      .limit(1);
    if (
      (active.data && active.data.length > 0) ||
      (finalizing.data && finalizing.data.length > 0)
    ) {
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
      stateVersion: 0,
      continueLastAtMs: null,
      continueLastError: null,
      finalizeLeaseToken: null,
      finalizeLeaseExpiresMs: null,
      nhlBaselineSnapshot: input.nhlBaselineSnapshot ?? null,
      publishRowsInserted: null,
      publishRpcRecordedAtMs: null,
      abortReason: null,
      abortEvidence: null,
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

  async claimWork(params: {
    jobId: string;
    leaseToken: string;
    nowMs: number;
    mode: "chunk" | "finalize";
  }): Promise<
    { ok: true; job: StagedGenerationJob } | { ok: false; reason: string }
  > {
    const leaseUntil = new Date(params.nowMs + SCREENER_SYNC_LEASE_MS)
      .toISOString();
    const nowIso = new Date(params.nowMs).toISOString();
    const rpc = await this.sb.rpc("claim_screener_sync_lease_v1", {
      p_job_id: params.jobId,
      p_lease_token: params.leaseToken,
      p_now: nowIso,
      p_lease_expires_at: leaseUntil,
      p_mode: params.mode,
    });
    if (!rpc.error) {
      const parsed = rpc.data as { ok?: boolean; reason?: string; job?: StagingJobRow };
      if (parsed?.ok && parsed.job) {
        return { ok: true, job: jobFromRow(parsed.job) };
      }
      return {
        ok: false,
        reason: typeof parsed?.reason === "string"
          ? parsed.reason
          : "claim_rejected",
      };
    }
    if (!isMissingRpc(rpc.error)) {
      return { ok: false, reason: "claim_rpc_failed" };
    }
    return { ok: false, reason: "staging_rpc_missing" };
  }

  async advanceChunk(params: {
    jobId: string;
    leaseToken: string;
    expectedChunkIndex: number;
    expectedStateVersion: number;
    merged: StagedChunkArtifacts;
    nowMs: number;
  }): Promise<
    { ok: true; job: StagedGenerationJob } | { ok: false; reason: string }
  > {
    const nowIso = new Date(params.nowMs).toISOString();
    const rpc = await this.sb.rpc("advance_screener_sync_chunk_v1", {
      p_job_id: params.jobId,
      p_lease_token: params.leaseToken,
      p_expected_chunk_index: params.expectedChunkIndex,
      p_expected_state_version: params.expectedStateVersion,
      p_merged_artifacts: serializeMergedArtifacts(params.merged),
      p_now: nowIso,
    });
    if (!rpc.error) {
      const parsed = rpc.data as { ok?: boolean; reason?: string; job?: StagingJobRow };
      if (parsed?.ok && parsed.job) {
        return { ok: true, job: jobFromRow(parsed.job) };
      }
      return {
        ok: false,
        reason: typeof parsed?.reason === "string"
          ? parsed.reason
          : "chunk_advance_rejected",
      };
    }
    if (!isMissingRpc(rpc.error)) {
      return { ok: false, reason: "advance_rpc_failed" };
    }
    return { ok: false, reason: "staging_rpc_missing" };
  }

  async recordPublishRpc(params: {
    jobId: string;
    finalizeLeaseToken: string;
    expectedStateVersion: number;
    syncRunId: string;
    rowsInserted: number;
    nowMs: number;
  }): Promise<
    { ok: true; job: StagedGenerationJob } | { ok: false; reason: string }
  > {
    const nowIso = new Date(params.nowMs).toISOString();
    const rpc = await this.sb.rpc("record_screener_sync_publish_rpc_v1", {
      p_job_id: params.jobId,
      p_finalize_lease_token: params.finalizeLeaseToken,
      p_expected_state_version: params.expectedStateVersion,
      p_sync_run_id: params.syncRunId,
      p_rows_inserted: params.rowsInserted,
      p_now: nowIso,
    });
    if (!rpc.error) {
      const parsed = rpc.data as { ok?: boolean; reason?: string; job?: StagingJobRow };
      if (parsed?.ok && parsed.job) {
        return { ok: true, job: jobFromRow(parsed.job) };
      }
      return {
        ok: false,
        reason: typeof parsed?.reason === "string"
          ? parsed.reason
          : "publish_rpc_record_rejected",
      };
    }
    if (!isMissingRpc(rpc.error)) {
      return { ok: false, reason: "publish_rpc_record_failed" };
    }
    return { ok: false, reason: "staging_rpc_missing" };
  }

  async publishStagedGeneration(params: {
    jobId: string;
    finalizeLeaseToken: string;
    expectedStateVersion: number;
    syncRunId: string;
    syncedAt: string;
    nhlBaselineStatus: string;
    tabEvaluationEvidence: unknown;
    rows: unknown[];
    nowMs: number;
  }): Promise<
    | { ok: true; rowsInserted: number; job: StagedGenerationJob }
    | { ok: false; reason: string }
  > {
    const nowIso = new Date(params.nowMs).toISOString();
    const rpc = await this.sb.rpc("publish_screener_sync_staged_generation_v1", {
      p_job_id: params.jobId,
      p_finalize_lease_token: params.finalizeLeaseToken,
      p_expected_state_version: params.expectedStateVersion,
      p_rows: params.rows,
      p_sync_run_id: params.syncRunId,
      p_synced_at: params.syncedAt,
      p_nhl_baseline_status: params.nhlBaselineStatus,
      p_tab_evaluation_evidence: params.tabEvaluationEvidence,
      p_now: nowIso,
    });
    if (!rpc.error) {
      const parsed = rpc.data as {
        ok?: boolean;
        reason?: string;
        rows_inserted?: number;
        job?: StagingJobRow;
      };
      if (
        parsed?.ok &&
        typeof parsed.rows_inserted === "number" &&
        parsed.job
      ) {
        return {
          ok: true,
          rowsInserted: parsed.rows_inserted,
          job: jobFromRow(parsed.job),
        };
      }
      return {
        ok: false,
        reason: typeof parsed?.reason === "string"
          ? parsed.reason
          : "staged_publish_rejected",
      };
    }
    if (isMissingRpc(rpc.error)) {
      return { ok: false, reason: "staging_rpc_missing" };
    }
    return { ok: false, reason: "staged_publish_failed" };
  }

  async completePublish(params: {
    jobId: string;
    finalizeLeaseToken: string;
    expectedStateVersion: number;
    nowMs: number;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    const nowIso = new Date(params.nowMs).toISOString();
    const rpc = await this.sb.rpc("complete_screener_sync_publish_v1", {
      p_job_id: params.jobId,
      p_finalize_lease_token: params.finalizeLeaseToken,
      p_expected_state_version: params.expectedStateVersion,
      p_now: nowIso,
    });
    if (!rpc.error) {
      const parsed = rpc.data as { ok?: boolean; reason?: string };
      if (parsed?.ok) return { ok: true };
      return {
        ok: false,
        reason: typeof parsed?.reason === "string"
          ? parsed.reason
          : "publish_complete_rejected",
      };
    }
    if (!isMissingRpc(rpc.error)) {
      return { ok: false, reason: "complete_rpc_failed" };
    }
    return { ok: false, reason: "staging_rpc_missing" };
  }

  async failJob(jobId: string, reason: string, nowMs: number): Promise<void> {
    await this.sb.from(TABLE).update({
      status: "failed",
      continue_last_error: reason,
      updated_at: new Date(nowMs).toISOString(),
    }).eq("id", jobId);
  }

  async abortJob(
    jobId: string,
    nowMs: number,
    detail?: import("./generation-abort-diagnostics.ts").ScreenerSyncAbortDetail,
  ): Promise<void> {
    await this.sb.from(TABLE).update({
      status: "aborted",
      lease_token: null,
      lease_expires_at: null,
      finalize_lease_token: null,
      finalize_lease_expires_at: null,
      abort_reason: detail?.reason ?? null,
      abort_evidence: detail?.evidence ?? null,
      updated_at: new Date(nowMs).toISOString(),
    })
      .eq("id", jobId)
      .in("status", ["chunking", "finalizing"]);
  }

  async recordContinueDispatch(params: {
    jobId: string;
    action: string;
    ok: boolean;
    error?: string;
    nowMs: number;
  }): Promise<void> {
    await this.sb.from(TABLE).update({
      continue_last_at: new Date(params.nowMs).toISOString(),
      continue_last_error: params.ok ? null : (params.error ?? "continue_failed"),
      updated_at: new Date(params.nowMs).toISOString(),
    }).eq("id", params.jobId);
  }
}

export function createSupabaseSyncStagingStore(
  sb: StagingTableClient,
): SupabaseSyncStagingStore {
  return new SupabaseSyncStagingStore(sb);
}
