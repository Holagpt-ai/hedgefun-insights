import { describe, expect, it, vi } from "vitest";
import { parseCsvText, importIdentityKey, csvRowFingerprint } from "./csv";
import {
  JOURNAL_IMPORT_FINALIZE_RPC,
  JOURNAL_IMPORT_ROLLBACK_RPC,
  JOURNAL_IMPORT_ROW_RPC,
  JOURNAL_IMPORT_START_RPC,
  canRollbackImportJob,
  formatConfirmedImportSummary,
  loadRecentImportJobs,
  rollbackImportJob,
  runCsvImport,
} from "./import-service";
import { hydrateTradeGraph } from "../ledger/hydrateTrade";
import { graphRowsFromPayload } from "../ledger/loadTrades";
import { buildJournalSavePayload } from "../ledger/persist-contract";
import type { JournalDb, JournalQuery } from "../ledger/saveTrade";

const USER_A = "11111111-1111-4111-8111-0000000000aa";
const USER_B = "22222222-2222-4222-8222-0000000000bb";
const JOB_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const SUCCESS_CSV = `symbol,side,qty,entry_price,exit_price,entry_date,exit_date,commission,id
NVDA,long,100,118.4,122.88,2026-08-14,2026-08-14,8,nvda-csv
AAPL,long,100,215.8,217.08,2026-08-14,2026-08-14,8,aapl-csv
`;

const MIXED_CSV = `symbol,side,qty,entry_price,exit_price,entry_date,exit_date,commission,id
NVDA,long,100,118.4,122.88,2026-08-14,2026-08-14,8,nvda-csv
BAD,,0,x,y,not-a-date,,8,bad-csv
AAPL,long,100,215.8,217.08,2026-08-14,2026-08-14,8,nvda-csv
MSFT,long,10,400,410,2026-08-14,2026-08-14,2,msft-fail
`;

type RpcCall = { fn: string; args: Record<string, unknown> };

function thenableQuery(getData: () => { data: unknown; error: { message: string } | null }): JournalQuery {
  const query = {
    insert: (rows: unknown) => Object.assign(Promise.resolve({ data: rows, error: null }), query),
    select: () => query,
    delete: () => query,
    eq: () => query,
    in: () => query,
    order: () => query,
    limit: () => query,
    then: (
      resolve?: (value: { data: unknown; error: { message: string } | null }) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(getData()).then(resolve, reject),
  } as JournalQuery & PromiseLike<{ data: unknown; error: { message: string } | null }>;
  return query;
}

function createHarness(options?: { failExternalIds?: string[]; jobs?: Array<Record<string, unknown>> }) {
  const calls: RpcCall[] = [];
  const fromTables: string[] = [];
  const importedIdentities = new Set<string>();
  const persisted: Array<{
    tradeId: string;
    jobId: string;
    source: string;
    importJobId: string | null;
    externalIds: Array<string | null>;
    userIdFromPayload: unknown;
  }> = [];
  const jobs = [...(options?.jobs ?? [])];
  const failExternalIds = new Set(options?.failExternalIds ?? ["msft-fail"]);
  let jobSeq = 0;
  let rowSeq = 0;
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    if (fn === JOURNAL_IMPORT_START_RPC) {
      const payload = args.p_payload as {
        user_id?: unknown;
        rows?: Array<Record<string, unknown>>;
        filename?: string;
        source?: string;
      };
      expect(payload.user_id).toBe("ignored-client-user-id");
      jobSeq += 1;
      const jobId = `${JOB_ID.slice(0, -1)}${jobSeq}`;
      const rows = (payload.rows ?? []).map((row) => {
        rowSeq += 1;
        const identity = String(row.identity_key ?? "");
        let status = String(row.status ?? "pending");
        if (identity && importedIdentities.has(identity)) status = "duplicate";
        const id = `00000000-0000-4000-8000-${String(rowSeq).padStart(12, "0")}`;
        return { id, row_index: row.row_index, status, identity_key: identity, external_id: row.external_id };
      });
      jobs.unshift({
        id: jobId,
        source: payload.source,
        filename: payload.filename,
        status: "processing",
        created_at: "2026-08-18T00:00:00.000Z",
        imported_count: 0,
        failed_count: 0,
        invalid_count: 0,
        duplicate_count: 0,
        total_count: rows.length,
      });
      return { data: { ok: true, job_id: jobId, rows }, error: null };
    }
    if (fn === JOURNAL_IMPORT_ROW_RPC) {
      const payload = args.p_payload as {
        trade?: { source?: string; import_job_id?: string; user_id?: unknown };
        executions?: Array<{ external_execution_id?: string | null; source?: string; import_job_id?: string }>;
      };
      const external = payload.executions?.[0]?.external_execution_id ?? "";
      if (failExternalIds.has(external)) {
        return {
          data: { ok: false, status: "failed", error_code: "save_failed", error_message: "Trade could not be saved." },
          error: null,
        };
      }
      const tradeId = `bbbbbbbb-bbbb-4bbb-8bbb-${String(persisted.length + 1).padStart(12, "0")}`;
      const identityRows = calls
        .filter((call) => call.fn === JOURNAL_IMPORT_START_RPC)
        .flatMap((call) => ((call.args.p_payload as { rows?: Array<{ identity_key?: string; external_id?: string }> }).rows ?? []));
      const identity = identityRows.find((row) => row.external_id === external)?.identity_key;
      if (identity) importedIdentities.add(identity);
      persisted.push({
        tradeId,
        jobId: String(args.p_job_id),
        source: payload.trade?.source ?? "",
        importJobId: payload.trade?.import_job_id ?? null,
        externalIds: (payload.executions ?? []).map((row) => row.external_execution_id ?? null),
        userIdFromPayload: payload.trade?.user_id,
      });
      return { data: { ok: true, status: "imported", trade_id: tradeId }, error: null };
    }
    if (fn === JOURNAL_IMPORT_FINALIZE_RPC) {
      const start = [...calls].reverse().find((call) => call.fn === JOURNAL_IMPORT_START_RPC);
      const rows = ((start?.args.p_payload as { rows?: Array<Record<string, unknown>> })?.rows ?? []).map((row) => {
        const identity = String(row.identity_key ?? "");
        let status = String(row.status ?? "pending");
        if (status === "pending" && failExternalIds.has(String(row.external_id ?? ""))) status = "failed";
        else if (status === "pending" && importedIdentities.has(identity) && persisted.some((item) => item.jobId === args.p_job_id)) {
          // pending rows that persisted this job are imported; leftover identities already imported are duplicate
          const persistedHere = persisted.filter((item) => item.jobId === args.p_job_id);
          const ext = String(row.external_id ?? "");
          status = persistedHere.some((item) => item.externalIds.includes(ext)) ? "imported" : status;
        } else if (status === "pending" && importedIdentities.has(identity)) {
          const persistedHere = persisted.filter((item) => item.jobId === args.p_job_id);
          const ext = String(row.external_id ?? "");
          status = persistedHere.some((item) => item.externalIds.includes(ext)) ? "imported" : "duplicate";
        }
        return status;
      });
      const counts = {
        total_count: rows.length,
        imported_count: rows.filter((status) => status === "imported").length,
        failed_count: rows.filter((status) => status === "failed").length,
        invalid_count: rows.filter((status) => status === "invalid").length,
        duplicate_count: rows.filter((status) => status === "duplicate").length,
      };
      const status =
        counts.imported_count > 0 && counts.failed_count === 0 && counts.invalid_count === 0
          ? "completed"
          : counts.imported_count === 0 && counts.failed_count > 0
            ? "failed"
            : counts.failed_count > 0 || counts.invalid_count > 0
              ? "completed_with_errors"
              : "completed";
      const job = jobs.find((item) => item.id === args.p_job_id);
      if (job) Object.assign(job, counts, { status });
      return { data: { ok: true, job_id: args.p_job_id, status, ...counts }, error: null };
    }
    if (fn === JOURNAL_IMPORT_ROLLBACK_RPC) {
      const job = jobs.find((item) => item.id === args.p_job_id);
      if (!job) return { data: null, error: { message: "import job not found", code: "42501" } };
      const already = job.status === "rolled_back";
      const tradesDeleted = already ? 0 : persisted.filter((item) => item.jobId === args.p_job_id).length;
      if (!already) {
        for (let i = persisted.length - 1; i >= 0; i -= 1) {
          if (persisted[i].jobId === args.p_job_id) persisted.splice(i, 1);
        }
      }
      job.status = "rolled_back";
      return {
        data: { ok: true, job_id: args.p_job_id, trades_deleted: tradesDeleted, already_rolled_back: already },
        error: null,
      };
    }
    return { data: null, error: { message: `unexpected rpc ${fn}` } };
  });

  const client: JournalDb = {
    from: (table: string) => {
      fromTables.push(table);
      return thenableQuery(() => ({ data: jobs, error: null }));
    },
    rpc,
  };

  return { client, calls, fromTables, persisted, importedIdentities, jobs, rpc };
}

describe("import identity (client, not PostgreSQL)", () => {
  it("scopes deterministic identity by user, source, and external id", () => {
    const fp = csvRowFingerprint({ symbol: "NVDA", direction: "long", qty: 100, entryPrice: 118.4, exitPrice: 122.88, entryDate: "2026-08-14", exitDate: "2026-08-14", fees: 8 });
    const a = importIdentityKey(USER_A, "csv", "nvda-csv", fp);
    const b = importIdentityKey(USER_B, "csv", "nvda-csv", fp);
    expect(a).toContain(USER_A);
    expect(a).toContain("ext:nvda-csv");
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/job-/);
    expect(a.includes(String(Date.now()))).toBe(false);
  });

  it("uses a fingerprint when no external id exists", () => {
    const fp = csvRowFingerprint({ symbol: "NVDA", direction: "long", qty: 100, entryPrice: 1, exitPrice: 2, entryDate: "2026-08-14", exitDate: "2026-08-14", fees: 0 });
    expect(importIdentityKey(USER_A, "csv", null, fp)).toContain("fp:");
  });
});

describe("authenticated CSV import service (mocked RPCs, not executed PostgreSQL)", () => {
  it("imports an all-success CSV using confirmed finalize counts", async () => {
    const { client, persisted, calls } = createHarness({ failExternalIds: [] });
    const result = await runCsvImport(parseCsvText(SUCCESS_CSV), {
      mode: "live",
      userId: USER_A,
      client,
      filename: "success.csv",
    });
    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({
      total_count: 2,
      imported_count: 2,
      failed_count: 0,
      invalid_count: 0,
      duplicate_count: 0,
    });
    expect(result.shouldHideDemo).toBe(true);
    expect(result.shouldRefresh).toBe(true);
    expect(persisted).toHaveLength(2);
    expect(calls.filter((call) => call.fn === JOURNAL_IMPORT_ROW_RPC)).toHaveLength(2);
    expect(formatConfirmedImportSummary(result.counts)).toBe("2 trades imported. 0 invalid rows. 0 duplicate. 0 failed.");
  });

  it("records mixed success, invalid, duplicate, and failed rows with database-derived counts", async () => {
    const { client, calls } = createHarness();
    const parsed = parseCsvText(MIXED_CSV);
    expect(parsed.rows.map((row) => row.status)).toEqual(["pending", "invalid", "duplicate", "pending"]);
    const result = await runCsvImport(parsed, { mode: "live", userId: USER_A, client, filename: "mixed.csv" });
    expect(result.ok).toBe(true);
    expect(result.counts).toEqual({
      total_count: 4,
      imported_count: 1,
      failed_count: 1,
      invalid_count: 1,
      duplicate_count: 1,
    });
    expect(formatConfirmedImportSummary(result.counts)).toBe("1 trades imported. 1 invalid rows. 1 duplicate. 1 failed.");
    const rowCalls = calls.filter((call) => call.fn === JOURNAL_IMPORT_ROW_RPC);
    expect(rowCalls).toHaveLength(2);
    const startRows = (calls.find((call) => call.fn === JOURNAL_IMPORT_START_RPC)?.args.p_payload as { rows: Array<{ status: string }> }).rows;
    expect(startRows.filter((row) => row.status === "invalid" || row.status === "duplicate")).toHaveLength(2);
  });

  it("does not trust client loop counters when finalize returns database counts", async () => {
    const { client, rpc } = createHarness({ failExternalIds: [] });
    rpc.mockImplementationOnce(async (fn: string) => {
      if (fn === JOURNAL_IMPORT_START_RPC) {
        return {
          data: {
            ok: true,
            job_id: JOB_ID,
            rows: [
              { id: "r1", row_index: 2, status: "pending" },
              { id: "r2", row_index: 3, status: "pending" },
            ],
          },
          error: null,
        };
      }
      return { data: null, error: { message: "unexpected" } };
    });
    rpc.mockImplementationOnce(async () => ({ data: { ok: true, status: "imported", trade_id: "t1" }, error: null }));
    rpc.mockImplementationOnce(async () => ({ data: { ok: true, status: "imported", trade_id: "t2" }, error: null }));
    rpc.mockImplementationOnce(async () => ({
      data: {
        ok: true,
        status: "completed_with_errors",
        total_count: 12,
        imported_count: 8,
        failed_count: 1,
        invalid_count: 2,
        duplicate_count: 1,
      },
      error: null,
    }));
    const result = await runCsvImport(parseCsvText(SUCCESS_CSV), {
      mode: "live",
      userId: USER_A,
      client,
      filename: "counts.csv",
    });
    expect(result.counts.imported_count).toBe(8);
    expect(result.counts.invalid_count).toBe(2);
    expect(result.counts.duplicate_count).toBe(1);
    expect(result.counts.failed_count).toBe(1);
    expect(formatConfirmedImportSummary(result.counts)).toBe("8 trades imported. 2 invalid rows. 1 duplicate. 1 failed.");
    expect(formatConfirmedImportSummary(result.counts)).not.toBe("12 trades imported");
  });

  it("treats a forced child-save failure as a failed row without counting it imported", async () => {
    const { client, persisted } = createHarness();
    const result = await runCsvImport(parseCsvText(MIXED_CSV), {
      mode: "live",
      userId: USER_A,
      client,
      filename: "fail.csv",
    });
    expect(result.counts.failed_count).toBe(1);
    expect(result.counts.imported_count).toBe(1);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].externalIds).toContain("nvda-csv");
  });

  it("stamps import job/source metadata and preserves external IDs through the persist payload", async () => {
    const { client, persisted, calls } = createHarness({ failExternalIds: [] });
    await runCsvImport(parseCsvText(SUCCESS_CSV), { mode: "live", userId: USER_A, client, filename: "meta.csv" });
    expect(persisted[0].source).toBe("import");
    expect(persisted[0].importJobId).toBe(persisted[0].jobId);
    expect(persisted[0].externalIds).toEqual(["nvda-csv", "nvda-csv"]);
    expect(persisted[0].userIdFromPayload).toBeUndefined();
    const payload = (calls.find((call) => call.fn === JOURNAL_IMPORT_ROW_RPC)?.args.p_payload) as ReturnType<typeof buildJournalSavePayload>;
    const graph = graphRowsFromPayload(payload, USER_A);
    const hydrated = hydrateTradeGraph({
      trade: graph.trade,
      plan: graph.plan,
      account: graph.account,
      playbook: graph.playbook,
      legs: graph.legs,
      executions: graph.executions,
      fees: graph.fees,
    });
    expect(hydrated.trade.source).toBe("import");
    expect(hydrated.trade.importJobId).toBe(persisted[0].jobId);
    expect(hydrated.trade.executions[0].externalExecutionId).toBe("nvda-csv");
  });

  it("does not send duplicate in-file rows to the trade-save RPC", async () => {
    const { client, calls } = createHarness({ failExternalIds: [] });
    const parsed = parseCsvText(`${SUCCESS_CSV}NVDA,long,100,118.4,122.88,2026-08-14,2026-08-14,8,nvda-csv\n`);
    const result = await runCsvImport(parsed, { mode: "live", userId: USER_A, client, filename: "dup-file.csv" });
    expect(result.counts.duplicate_count).toBe(1);
    expect(result.counts.imported_count).toBe(2);
    expect(calls.filter((call) => call.fn === JOURNAL_IMPORT_ROW_RPC)).toHaveLength(2);
  });

  it("marks the same identity as duplicate across separate jobs", async () => {
    const { client } = createHarness({ failExternalIds: [] });
    const first = await runCsvImport(parseCsvText(SUCCESS_CSV), { mode: "live", userId: USER_A, client, filename: "a.csv" });
    const second = await runCsvImport(parseCsvText(SUCCESS_CSV), { mode: "live", userId: USER_A, client, filename: "b.csv" });
    expect(first.counts.imported_count).toBe(2);
    expect(second.counts.imported_count).toBe(0);
    expect(second.counts.duplicate_count).toBe(2);
    expect(second.shouldHideDemo).toBe(false);
  });

  it("allows the same external id for different users", async () => {
    const a = createHarness({ failExternalIds: [] });
    const b = createHarness({ failExternalIds: [] });
    const first = await runCsvImport(parseCsvText(SUCCESS_CSV), { mode: "live", userId: USER_A, client: a.client, filename: "a.csv" });
    const second = await runCsvImport(parseCsvText(SUCCESS_CSV), { mode: "live", userId: USER_B, client: b.client, filename: "b.csv" });
    expect(first.counts.imported_count).toBe(2);
    expect(second.counts.imported_count).toBe(2);
    expect(importIdentityKey(USER_A, "csv", "nvda-csv", "fp")).not.toBe(importIdentityKey(USER_B, "csv", "nvda-csv", "fp"));
  });

  it("does not duplicate trades when confirmation is repeated", async () => {
    const { client, persisted } = createHarness({ failExternalIds: [] });
    await runCsvImport(parseCsvText(SUCCESS_CSV), { mode: "live", userId: USER_A, client, filename: "once.csv" });
    await runCsvImport(parseCsvText(SUCCESS_CSV), { mode: "live", userId: USER_A, client, filename: "twice.csv" });
    expect(persisted).toHaveLength(2);
  });

  it("performs zero database reads or writes in demo mode", async () => {
    const { client, rpc, fromTables } = createHarness();
    const from = vi.spyOn(client, "from");
    const result = await runCsvImport(parseCsvText(SUCCESS_CSV), {
      mode: "demo",
      userId: USER_A,
      client,
      filename: "demo.csv",
    });
    expect(result.skipped).toBe("demo");
    expect(result.ok).toBe(false);
    expect(result.shouldHideDemo).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    expect(fromTables).toHaveLength(0);
    const jobs = await loadRecentImportJobs({ mode: "demo", userId: USER_A, client });
    expect(jobs).toEqual([]);
    expect(from).not.toHaveBeenCalled();
    const rolled = await rollbackImportJob(JOB_ID, { mode: "demo", userId: USER_A, client });
    expect(rolled.skipped).toBe("demo");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not hide Demo Workspace when zero rows persist", async () => {
    const { client } = createHarness({ failExternalIds: [] });
    const parsed = parseCsvText(`symbol,side,qty,entry_price,exit_price,entry_date,exit_date,commission,id
ZZZ,,0,x,y,bad,,1,bad-id
`);
    const result = await runCsvImport(parsed, { mode: "live", userId: USER_A, client, filename: "none.csv" });
    expect(result.counts.imported_count).toBe(0);
    expect(result.shouldHideDemo).toBe(false);
    expect(result.shouldRefresh).toBe(false);
  });

  it("requests a canonical refresh only after confirmed persistence", async () => {
    const { client } = createHarness({ failExternalIds: [] });
    const result = await runCsvImport(parseCsvText(SUCCESS_CSV), { mode: "live", userId: USER_A, client, filename: "refresh.csv" });
    expect(result.ok).toBe(true);
    expect(result.shouldRefresh).toBe(true);
    expect(result.counts.imported_count).toBeGreaterThan(0);
  });

  it("rolls back only trades belonging to the confirmed job", async () => {
    const { client, persisted } = createHarness({ failExternalIds: [] });
    const imported = await runCsvImport(parseCsvText(SUCCESS_CSV), { mode: "live", userId: USER_A, client, filename: "rb.csv" });
    expect(canRollbackImportJob({ status: imported.status ?? "completed", imported_count: imported.counts.imported_count })).toBe(true);
    const rolled = await rollbackImportJob(imported.jobId!, { mode: "live", userId: USER_A, client });
    expect(rolled.ok).toBe(true);
    expect(rolled.tradesDeleted).toBe(2);
    expect(persisted).toHaveLength(0);
  });

  it("leaves unrelated jobs untouched and is idempotent on a second rollback", async () => {
    const { client, persisted } = createHarness({ failExternalIds: [] });
    const first = await runCsvImport(parseCsvText(SUCCESS_CSV), { mode: "live", userId: USER_A, client, filename: "one.csv" });
    const secondCsv = `symbol,side,qty,entry_price,exit_price,entry_date,exit_date,commission,id
MSFT,long,10,400,410,2026-08-14,2026-08-14,2,msft-csv
`;
    const second = await runCsvImport(parseCsvText(secondCsv), { mode: "live", userId: USER_A, client, filename: "two.csv" });
    expect(persisted).toHaveLength(3);
    const rolled = await rollbackImportJob(first.jobId!, { mode: "live", userId: USER_A, client });
    expect(rolled.tradesDeleted).toBe(2);
    expect(persisted).toHaveLength(1);
    expect(persisted[0].jobId).toBe(second.jobId);
    const again = await rollbackImportJob(first.jobId!, { mode: "live", userId: USER_A, client });
    expect(again.ok).toBe(true);
    expect(again.alreadyRolledBack).toBe(true);
    expect(again.tradesDeleted).toBe(0);
    expect(persisted).toHaveLength(1);
  });

  it("rejects a cross-user rollback without treating it as success", async () => {
    const { client } = createHarness({ failExternalIds: [] });
    const imported = await runCsvImport(parseCsvText(SUCCESS_CSV), { mode: "live", userId: USER_A, client, filename: "own.csv" });
    const other: JournalDb = {
      from: client.from,
      rpc: vi.fn(async () => ({ data: null, error: { message: "import job not found", code: "42501" } })),
    };
    const rolled = await rollbackImportJob(imported.jobId!, { mode: "live", userId: USER_B, client: other });
    expect(rolled.ok).toBe(false);
    expect(rolled.error).toBe("Rollback was not confirmed.");
  });

  it("never reports unconfirmed success when finalize does not confirm", async () => {
    const { client, rpc } = createHarness({ failExternalIds: [] });
    rpc.mockImplementation(async (fn: string) => {
      if (fn === JOURNAL_IMPORT_START_RPC) {
        return { data: { ok: true, job_id: JOB_ID, rows: [{ id: "r1", row_index: 2, status: "pending" }] }, error: null };
      }
      if (fn === JOURNAL_IMPORT_ROW_RPC) {
        return { data: { ok: true, status: "imported", trade_id: "t1" }, error: null };
      }
      return { data: { ok: false }, error: null };
    });
    const result = await runCsvImport(parseCsvText(SUCCESS_CSV), { mode: "live", userId: USER_A, client, filename: "no.csv" });
    expect(result.ok).toBe(false);
    expect(result.shouldHideDemo).toBe(false);
    expect(result.shouldRefresh).toBe(false);
    expect(result.error).toBe("Import was not confirmed.");
  });
});
