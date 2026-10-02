import { RUN_STALE_AFTER_MS } from "./config.ts";
import type { CatalystIntelStore } from "./persistence.ts";
import type { RunTelemetry } from "./types.ts";

export const RUN_RECOVERY_REASON = "worker_abandoned_or_resource_termination";

export type RunRecoveryStatus =
  | "WOULD_RECOVER"
  | "RECOVERED"
  | "NO_CHANGE"
  | "NOT_STALE"
  | "CONFLICT"
  | "NOT_FOUND";

export interface RunRecoveryResult {
  status: "OK" | "VALIDATION_ERROR" | "NOT_FOUND";
  dryRun: boolean;
  runId: string | null;
  recoveryStatus: RunRecoveryStatus | null;
  proposedStatus: RunTelemetry["status"] | null;
  concurrencyToken: string | null;
  staleAgeMs: number | null;
  error?: string;
}

export interface RunRecoveryInput {
  runId: string;
  dryRun: boolean;
  apply: boolean;
  concurrencyToken?: string | null;
  now?: Date;
  staleAfterMs?: number;
}

export function runProgressAtMs(run: RunTelemetry): number {
  const ingestion = (run.observability as { ingestion?: { last_progress_at?: string | null } } | undefined)?.ingestion;
  const stamp = ingestion?.last_progress_at || run.startedAt;
  const parsed = Date.parse(stamp);
  return Number.isFinite(parsed) ? parsed : Date.parse(run.startedAt);
}

export function runRecoveryToken(run: RunTelemetry): string {
  return `${run.status}|${run.startedAt}|${run.rawItemsSeen}|${run.errors.length}`;
}

export async function runStaleRunRecovery(
  store: CatalystIntelStore,
  input: RunRecoveryInput,
): Promise<RunRecoveryResult> {
  const dryRun = input.apply ? false : input.dryRun;
  if (input.apply === input.dryRun) {
    return { status: "VALIDATION_ERROR", dryRun, runId: null, recoveryStatus: null, proposedStatus: null, concurrencyToken: null, staleAgeMs: null };
  }
  if (input.apply && !input.concurrencyToken) {
    return { status: "VALIDATION_ERROR", dryRun: false, runId: null, recoveryStatus: null, proposedStatus: null, concurrencyToken: null, staleAgeMs: null };
  }
  const run = await store.getRun(input.runId.trim());
  if (!run) {
    return { status: "NOT_FOUND", dryRun, runId: input.runId, recoveryStatus: "NOT_FOUND", proposedStatus: null, concurrencyToken: null, staleAgeMs: null };
  }
  if (run.status !== "running") {
    return {
      status: "OK",
      dryRun,
      runId: run.runId,
      recoveryStatus: "NO_CHANGE",
      proposedStatus: run.status,
      concurrencyToken: runRecoveryToken(run),
      staleAgeMs: null,
    };
  }
  const now = input.now ?? new Date();
  const staleAfterMs = input.staleAfterMs ?? RUN_STALE_AFTER_MS;
  const ageMs = now.getTime() - runProgressAtMs(run);
  if (ageMs < staleAfterMs) {
    return {
      status: "OK",
      dryRun,
      runId: run.runId,
      recoveryStatus: "NOT_STALE",
      proposedStatus: "running",
      concurrencyToken: runRecoveryToken(run),
      staleAgeMs: ageMs,
    };
  }
  const token = runRecoveryToken(run);
  if (input.apply && input.concurrencyToken !== token) {
    return {
      status: "OK",
      dryRun: false,
      runId: run.runId,
      recoveryStatus: "CONFLICT",
      proposedStatus: null,
      concurrencyToken: token,
      staleAgeMs: ageMs,
      error: "concurrency_token_mismatch",
    };
  }
  if (dryRun) {
    return {
      status: "OK",
      dryRun: true,
      runId: run.runId,
      recoveryStatus: "WOULD_RECOVER",
      proposedStatus: "failed",
      concurrencyToken: token,
      staleAgeMs: ageMs,
    };
  }
  const recoveredAt = now.toISOString();
  run.status = "failed";
  run.completedAt = recoveredAt;
  run.elapsedMs = ageMs;
  run.errors.push({
    sourceId: run.bot,
    category: "stale_run_recovery",
    statusCode: null,
    retryable: false,
    elapsedMs: ageMs,
    details: {
      reason: RUN_RECOVERY_REASON,
      recovered_at: recoveredAt,
    },
  });
  await store.saveRun(run);
  return {
    status: "OK",
    dryRun: false,
    runId: run.runId,
    recoveryStatus: "RECOVERED",
    proposedStatus: "failed",
    concurrencyToken: runRecoveryToken(run),
    staleAgeMs: ageMs,
  };
}
