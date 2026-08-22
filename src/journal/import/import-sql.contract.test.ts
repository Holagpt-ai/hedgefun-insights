import { describe, expect, it } from "vitest";
import { readJournalSql } from "../db/journal-sql";

const SCHEMA_SQL = readJournalSql("foundation");
const RLS_SQL = readJournalSql("policy");
const FN_SQL = readJournalSql("functions");

function functionBody(sql: string, name: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = sql.indexOf("CREATE OR REPLACE FUNCTION public.", start + 10);
  return next === -1 ? sql.slice(start) : sql.slice(start, next);
}

describe("journal import SQL-text contract (not executed PostgreSQL)", () => {
  it("adds job/row audit columns and an imported identity unique index", () => {
    expect(SCHEMA_SQL).toMatch(/journal_import_jobs[\s\S]*imported_count/);
    expect(SCHEMA_SQL).toMatch(/journal_import_rows[\s\S]*identity_key/);
    expect(SCHEMA_SQL).toMatch(/journal_import_rows_imported_identity_uidx/);
    expect(SCHEMA_SQL).toMatch(/WHERE status = 'imported' AND identity_key IS NOT NULL/);
  });

  it("scopes jobs and rows to auth.uid() so user A cannot view user B's import data", () => {
    expect(RLS_SQL).toContain("'journal_import_jobs'");
    expect(RLS_SQL).toContain("'journal_import_rows'");
    expect(RLS_SQL).toContain("user_id = auth.uid()");
    expect(RLS_SQL).toContain("('journal_import_rows', 'journal_import_jobs', 'import_job_id')");
    expect(RLS_SQL).toMatch(/p\.user_id = auth\.uid\(\)/);
    expect(RLS_SQL).toMatch(/t \|\| '_select_own'/);
    expect(RLS_SQL).toMatch(/t \|\| '_insert_own'/);
    expect(RLS_SQL).toMatch(/t \|\| '_update_own'/);
  });

  it("ignores client-supplied user_id and owns jobs from auth.uid()", () => {
    const start = functionBody(FN_SQL, "journal_import_start_v1");
    expect(start).toMatch(/Never trust a client-supplied user_id/);
    expect(start).toMatch(/v_uid := auth\.uid\(\)/);
    expect(start).toMatch(/INSERT INTO public\.journal_import_jobs/);
    expect(start).toMatch(/VALUES \(\s*v_uid/);
    expect(start).toMatch(/demo workspace cannot persist trades/);
  });

  it("rejects another user's job with the same not-found error for row, finalize, and rollback", () => {
    for (const name of ["journal_import_row_v1", "journal_import_finalize_v1", "journal_import_rollback"]) {
      const body = functionBody(FN_SQL, name);
      expect(body).toMatch(/user_id = (auth\.uid\(\)|v_uid)/);
      expect(body).toMatch(/import job not found/);
      expect(body).toMatch(/ERRCODE = '42501'/);
    }
  });

  it("imports a pending row through journal_save_trade_v1 inside a subtransaction", () => {
    const row = functionBody(FN_SQL, "journal_import_row_v1");
    expect(row).toMatch(/public\.journal_save_trade_v1\(v_payload\)/);
    expect(row).toMatch(/EXCEPTION/);
    expect(row).toMatch(/Subtransaction rolls back the trade graph/);
    expect(row).toMatch(/Trade could not be saved\./);
    expect(row).not.toMatch(/SQLERRM/);
    expect(row).toMatch(/jsonb_set\(v_payload, '\{trade,source\}', to_jsonb\('import'::text\)/);
    expect(row).toMatch(/jsonb_set\(v_payload, '\{trade,import_job_id\}', to_jsonb\(p_job_id::text\)/);
    expect(row).toMatch(/demo%/);
  });

  it("finalizes counts from row statuses rather than client counters", () => {
    const finalize = functionBody(FN_SQL, "journal_import_finalize_v1");
    expect(finalize).toMatch(/count\(\*\) FILTER \(WHERE status = 'imported'\)/);
    expect(finalize).toMatch(/count\(\*\) FILTER \(WHERE status = 'failed'\)/);
    expect(finalize).toMatch(/count\(\*\) FILTER \(WHERE status = 'invalid'\)/);
    expect(finalize).toMatch(/count\(\*\) FILTER \(WHERE status = 'duplicate'\)/);
    expect(finalize).toMatch(/completed_with_errors/);
  });

  it("rolls back only the caller's trades for that import job and preserves audit rows", () => {
    const rollback = functionBody(FN_SQL, "journal_import_rollback");
    expect(rollback).toMatch(/DELETE FROM public\.journal_trades t/);
    expect(rollback).toMatch(/t\.user_id = auth\.uid\(\)/);
    expect(rollback).toMatch(/t\.import_job_id = p_job_id/);
    expect(rollback).not.toMatch(/DELETE FROM public\.journal_import_jobs/);
    expect(rollback).not.toMatch(/DELETE FROM public\.journal_import_rows/);
    expect(rollback).toMatch(/status = CASE WHEN status = 'imported' THEN 'rolled_back'/);
    expect(rollback).toMatch(/already_rolled_back/);
    expect(rollback).toMatch(/'ok', true/);
  });

  it("validates import job ownership inside journal_save_trade_v1", () => {
    const save = functionBody(FN_SQL, "journal_save_trade_v1");
    expect(save).toMatch(/Import ownership is established from auth\.uid\(\)/);
    expect(save).toMatch(/FROM public\.journal_import_jobs j/);
    expect(save).toMatch(/j\.user_id = v_uid/);
    expect(save).toMatch(/INSERT INTO public\.journal_trades \([\s\S]*import_job_id/);
    expect(save).toMatch(/WHEN v_import_job_id IS NOT NULL THEN 'import'/);
    expect(save).toMatch(/WHEN v_import_job_id IS NOT NULL THEN v_import_job_id/);
  });
});
