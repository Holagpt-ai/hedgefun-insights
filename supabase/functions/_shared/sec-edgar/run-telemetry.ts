import type { SecActivationSummary, SecSyncMode } from "./activation.ts";

export type SecRunStatus = "ok" | "error" | "lease_busy" | "paused" | "write_disabled";

export type SecRunRecord = {
  run_id: string;
  stream_key: string;
  mode: SecSyncMode;
  status: SecRunStatus;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  error_code: string | null;
  summary: SecActivationSummary;
};

export function newRunId(): string {
  return crypto.randomUUID();
}

export function buildSecRunRecord(input: {
  runId: string;
  streamKey: string;
  mode: SecSyncMode;
  status: SecRunStatus;
  startedAtMs: number;
  finishedAtMs: number;
  errorCode: string | null;
  summary: SecActivationSummary;
}): SecRunRecord {
  return {
    run_id: input.runId,
    stream_key: input.streamKey,
    mode: input.mode,
    status: input.status,
    started_at: new Date(input.startedAtMs).toISOString(),
    finished_at: new Date(input.finishedAtMs).toISOString(),
    duration_ms: Math.max(0, input.finishedAtMs - input.startedAtMs),
    error_code: input.errorCode,
    summary: input.summary,
  };
}

export function logSecRunTelemetry(record: SecRunRecord): void {
  const s = record.summary;
  console.log(
    JSON.stringify({
      event: "sec_edgar_sync_run",
      run_id: record.run_id,
      mode: record.mode,
      status: record.status,
      duration_ms: record.duration_ms,
      error_code: record.error_code,
      checkpoint_status: s.checkpoint_status,
      pages_fetched: s.pages_fetched,
      entries_scanned: s.entries_scanned,
      rows_validated: s.rows_validated,
      rows_attribution_unattributed: s.rows_attribution_unattributed,
      rows_would_insert: s.rows_would_insert,
      rows_upserted: s.rows_upserted,
      rows_skipped_existing: s.rows_skipped_existing,
      rows_skipped_invalidated: s.rows_skipped_invalidated,
      sec_requests: s.sec_requests,
      consecutive_failures: s.consecutive_failures,
      ingestion_paused: s.ingestion_paused,
      auto_pause_applied: s.auto_pause_applied,
      checkpoint_revision: s.checkpoint_revision,
      last_success_at: s.last_success_at,
    }),
  );
}
