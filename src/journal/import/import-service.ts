import { isDemoTradeId } from "../lib/storage";
import type { TradeInput } from "../calc/types";
import { buildJournalSavePayload } from "../ledger/persist-contract";
import type { JournalDb } from "../ledger/saveTrade";
import {
  IMPORT_SOURCE_CSV,
  importIdentityKey,
  type ParsedCsv,
  type ParsedCsvRow,
} from "./csv";

export const JOURNAL_IMPORT_START_RPC = "journal_import_start_v1";
export const JOURNAL_IMPORT_ROW_RPC = "journal_import_row_v1";
export const JOURNAL_IMPORT_FINALIZE_RPC = "journal_import_finalize_v1";
export const JOURNAL_IMPORT_ROLLBACK_RPC = "journal_import_rollback";

export type ImportJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "completed_with_errors"
  | "failed"
  | "rolled_back";

export type ImportRowStatus = "pending" | "invalid" | "duplicate" | "imported" | "failed" | "rolled_back";

export interface ImportCounts {
  total_count: number;
  imported_count: number;
  failed_count: number;
  invalid_count: number;
  duplicate_count: number;
}

export interface ImportJobRecord extends ImportCounts {
  id: string;
  source: string;
  filename: string | null;
  status: ImportJobStatus;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface ImportProgress {
  processed: number;
  total: number;
}

export interface RunCsvImportOptions {
  mode: "demo" | "live" | "empty";
  userId: string;
  client: JournalDb;
  filename: string;
  source?: string;
  onProgress?: (progress: ImportProgress) => void;
}

export interface RunCsvImportResult {
  ok: boolean;
  skipped?: "demo";
  error?: string;
  jobId?: string;
  status?: ImportJobStatus;
  counts: ImportCounts;
  shouldHideDemo: boolean;
  shouldRefresh: boolean;
}

export interface RollbackImportResult {
  ok: boolean;
  skipped?: "demo";
  error?: string;
  jobId?: string;
  tradesDeleted: number;
  alreadyRolledBack?: boolean;
  shouldRefresh: boolean;
}

const EMPTY_COUNTS: ImportCounts = {
  total_count: 0,
  imported_count: 0,
  failed_count: 0,
  invalid_count: 0,
  duplicate_count: 0,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function isDemoScoped(trade: TradeInput | null): boolean {
  if (!trade) return false;
  return isDemoTradeId(trade.id) || trade.accountId.startsWith("demo-") || trade.id.startsWith("demo");
}

function countsFrom(value: unknown): ImportCounts {
  const row = asRecord(value);
  if (!row) return { ...EMPTY_COUNTS };
  return {
    total_count: asNumber(row.total_count),
    imported_count: asNumber(row.imported_count),
    failed_count: asNumber(row.failed_count),
    invalid_count: asNumber(row.invalid_count),
    duplicate_count: asNumber(row.duplicate_count),
  };
}

function stampImportTrade(row: ParsedCsvRow, jobId: string, source: string): TradeInput | null {
  if (!row.trade) return null;
  return {
    ...row.trade,
    source: "import",
    importJobId: jobId,
    externalId: row.externalId,
    executions: row.trade.executions.map((execution) => ({
      ...execution,
      source,
      importJobId: jobId,
      externalExecutionId: execution.externalExecutionId ?? row.externalId ?? undefined,
    })),
  };
}

export function formatConfirmedImportSummary(counts: ImportCounts): string {
  return `${counts.imported_count} trades imported. ${counts.invalid_count} invalid rows. ${counts.duplicate_count} duplicate. ${counts.failed_count} failed.`;
}

export function canRollbackImportJob(job: Pick<ImportJobRecord, "status" | "imported_count">): boolean {
  return (job.status === "completed" || job.status === "completed_with_errors") && job.imported_count > 0;
}

export async function runCsvImport(parsed: ParsedCsv, options: RunCsvImportOptions): Promise<RunCsvImportResult> {
  if (options.mode === "demo") {
    return {
      ok: false,
      skipped: "demo",
      counts: { ...EMPTY_COUNTS },
      shouldHideDemo: false,
      shouldRefresh: false,
    };
  }
  if (!options.userId) {
    return {
      ok: false,
      error: "Import was not confirmed: an authenticated session is required.",
      counts: { ...EMPTY_COUNTS },
      shouldHideDemo: false,
      shouldRefresh: false,
    };
  }
  if (parsed.rows.some((row) => isDemoScoped(row.trade))) {
    return {
      ok: false,
      error: "Import was not confirmed: demo identifiers cannot enter live imports.",
      counts: { ...EMPTY_COUNTS },
      shouldHideDemo: false,
      shouldRefresh: false,
    };
  }
  if (typeof options.client.rpc !== "function") {
    return {
      ok: false,
      error: "Import was not confirmed: the import RPC is unavailable.",
      counts: { ...EMPTY_COUNTS },
      shouldHideDemo: false,
      shouldRefresh: false,
    };
  }

  const source = options.source?.trim() || IMPORT_SOURCE_CSV;
  const startRows = parsed.rows.map((row) => ({
    row_index: row.line,
    raw: row.raw,
    parsed: row.trade
      ? {
          symbol: row.trade.symbol,
          direction: row.trade.direction,
          externalId: row.externalId,
          fingerprint: row.fingerprint,
        }
      : { errors: row.errors, fingerprint: row.fingerprint },
    identity_key: importIdentityKey(options.userId, source, row.externalId, row.fingerprint),
    external_id: row.externalId,
    status: row.status,
    error_code: row.errors[0] ?? (row.status === "duplicate" ? "duplicate" : null),
    error_message: row.errors.length ? row.errors.join(",") : row.status === "duplicate" ? "duplicate" : null,
  }));

  const started = await options.client.rpc(JOURNAL_IMPORT_START_RPC, {
    p_payload: {
      source,
      filename: options.filename,
      user_id: "ignored-client-user-id",
      rows: startRows,
    },
  });
  if (started.error) {
    return {
      ok: false,
      error: "Import was not confirmed.",
      counts: { ...EMPTY_COUNTS },
      shouldHideDemo: false,
      shouldRefresh: false,
    };
  }
  const startData = asRecord(started.data);
  const jobId = asString(startData?.job_id);
  const startedRows = Array.isArray(startData?.rows) ? (startData!.rows as Array<Record<string, unknown>>) : [];
  if (!jobId) {
    return {
      ok: false,
      error: "Import was not confirmed.",
      counts: { ...EMPTY_COUNTS },
      shouldHideDemo: false,
      shouldRefresh: false,
    };
  }

  const pending = startedRows.filter((row) => asString(row.status) === "pending");
  for (let i = 0; i < pending.length; i += 1) {
    const startedRow = pending[i];
    const rowId = asString(startedRow.id);
    const line = asNumber(startedRow.row_index);
    const parsedRow = parsed.rows.find((row) => row.line === line) ?? parsed.rows[i];
    options.onProgress?.({ processed: i, total: pending.length });
    if (!rowId || !parsedRow?.trade) continue;
    const trade = stampImportTrade(parsedRow, jobId, source);
    if (!trade) continue;
    const payload = buildJournalSavePayload(trade);
    await options.client.rpc(JOURNAL_IMPORT_ROW_RPC, {
      p_job_id: jobId,
      p_row_id: rowId,
      p_payload: payload,
    });
    options.onProgress?.({ processed: i + 1, total: pending.length });
  }

  const finalized = await options.client.rpc(JOURNAL_IMPORT_FINALIZE_RPC, { p_job_id: jobId });
  if (finalized.error) {
    return {
      ok: false,
      error: "Import was not confirmed.",
      jobId,
      counts: { ...EMPTY_COUNTS },
      shouldHideDemo: false,
      shouldRefresh: false,
    };
  }
  const finalData = asRecord(finalized.data);
  if (!finalData || finalData.ok === false) {
    return {
      ok: false,
      error: "Import was not confirmed.",
      jobId,
      counts: { ...EMPTY_COUNTS },
      shouldHideDemo: false,
      shouldRefresh: false,
    };
  }
  const counts = countsFrom(finalData);
  const status = (asString(finalData.status) ?? "failed") as ImportJobStatus;
  const imported = counts.imported_count > 0;
  return {
    ok: true,
    jobId,
    status,
    counts,
    shouldHideDemo: imported,
    shouldRefresh: imported,
  };
}

export async function loadRecentImportJobs(options: {
  mode: "demo" | "live" | "empty";
  userId: string;
  client: JournalDb;
}): Promise<ImportJobRecord[]> {
  if (options.mode === "demo" || !options.userId) return [];
  const result = await (options.client
    .from("journal_import_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20) as unknown as PromiseLike<{ data: unknown; error: { message: string } | null }>);
  if (result.error || !Array.isArray(result.data)) return [];
  return result.data
    .map((row): ImportJobRecord | null => {
      const rec = asRecord(row);
      if (!rec) return null;
      const id = asString(rec.id);
      if (!id) return null;
      return {
        id,
        source: asString(rec.source) ?? IMPORT_SOURCE_CSV,
        filename: asString(rec.filename),
        status: (asString(rec.status) ?? "pending") as ImportJobStatus,
        created_at: asString(rec.created_at) ?? "",
        started_at: asString(rec.started_at),
        finished_at: asString(rec.finished_at),
        ...countsFrom(rec),
      };
    })
    .filter((row): row is ImportJobRecord => Boolean(row));
}

export async function rollbackImportJob(jobId: string, options: {
  mode: "demo" | "live" | "empty";
  userId: string;
  client: JournalDb;
}): Promise<RollbackImportResult> {
  if (options.mode === "demo") {
    return { ok: false, skipped: "demo", tradesDeleted: 0, shouldRefresh: false };
  }
  if (!options.userId || !jobId) {
    return { ok: false, error: "Rollback was not confirmed.", tradesDeleted: 0, shouldRefresh: false };
  }
  const result = await options.client.rpc(JOURNAL_IMPORT_ROLLBACK_RPC, { p_job_id: jobId });
  if (result.error) {
    return { ok: false, error: "Rollback was not confirmed.", tradesDeleted: 0, shouldRefresh: false };
  }
  const data = asRecord(result.data);
  if (!data || data.ok !== true) {
    return { ok: false, error: "Rollback was not confirmed.", tradesDeleted: 0, shouldRefresh: false };
  }
  const tradesDeleted = asNumber(data.trades_deleted);
  return {
    ok: true,
    jobId: asString(data.job_id) ?? jobId,
    tradesDeleted,
    alreadyRolledBack: data.already_rolled_back === true,
    shouldRefresh: true,
  };
}
