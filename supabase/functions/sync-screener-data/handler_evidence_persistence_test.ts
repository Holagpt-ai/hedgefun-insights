import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type DbClient,
  type DbQuery,
  type DbSelectResult,
  type DbUpdateQuery,
  type DbUpdateResult,
  persistTabEvaluationEvidenceAfterLegacyRpc,
} from "./handler.ts";
import type { TabEvaluationEvidenceMap } from "../_shared/screeners/evaluation-evidence.ts";

const RUN_ID = "11111111-2222-3333-4444-555555555555";
const OTHER_RUN = "22222222-3333-4444-5555-666666666666";

const SAMPLE_EVIDENCE: TabEvaluationEvidenceMap = {
  gainers_losers: {
    status: "evaluated",
    universe_count: 400,
    qualified_count: 2,
    selected_count: 2,
  },
};

type FeedState = {
  sync_run_id: string;
  rows_inserted: number;
};

function thenableSelect(execute: () => Promise<DbSelectResult>): DbQuery {
  const builder: DbQuery = {
    eq: () => builder,
    in: () => builder,
    limit: () => builder,
    range: () => builder,
    then: <R1 = DbSelectResult, R2 = never>(
      onFulfilled?: ((value: DbSelectResult) => R1 | PromiseLike<R1>) | null,
      onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
    ): Promise<R1 | R2> =>
      execute().then(onFulfilled ?? undefined, onRejected ?? undefined) as Promise<R1 | R2>,
  };
  return builder;
}

function thenableUpdate(execute: () => Promise<DbUpdateResult>): DbUpdateQuery {
  const builder: DbUpdateQuery = {
    eq: () => builder,
    select: () => builder,
    then: <R1 = DbUpdateResult, R2 = never>(
      onFulfilled?: ((value: DbUpdateResult) => R1 | PromiseLike<R1>) | null,
      onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
    ): Promise<R1 | R2> =>
      execute().then(onFulfilled ?? undefined, onRejected ?? undefined) as Promise<R1 | R2>,
  };
  return builder;
}

function legacyPatchFailureReason(
  out: Awaited<ReturnType<typeof persistTabEvaluationEvidenceAfterLegacyRpc>>,
): string {
  if (out.mode === "legacy_patch" && out.persisted === false) return out.reason;
  return "";
}

function mockDb(opts: {
  feed?: FeedState | null;
  feedSelectError?: string;
  patchRows?: number;
  patchError?: string;
  patchReturnRowsInserted?: number;
}): { client: DbClient; patchCalls: Array<{ filters: Record<string, string> }> } {
  const patchCalls: Array<{ filters: Record<string, string> }> = [];
  const client: DbClient = {
    from: (table: string) => ({
      select: (_cols: string) =>
        thenableSelect(async () => {
          if (table !== "screener_feed_state") return { data: [], error: null };
          if (opts.feedSelectError) {
            return { data: null, error: { message: opts.feedSelectError } };
          }
          if (!opts.feed) return { data: [], error: null };
          return {
            data: [{
              sync_run_id: opts.feed.sync_run_id,
              rows_inserted: opts.feed.rows_inserted,
            }],
            error: null,
          };
        }),
      update: (_values: Record<string, unknown>) => {
        const filters: Record<string, string> = {};
        const builder = thenableUpdate(async () => {
          patchCalls.push({ filters: { ...filters } });
          if (opts.patchError) {
            return { data: null, error: { message: opts.patchError } };
          }
          const rows = opts.patchRows ?? 1;
          const rowsInserted = opts.patchReturnRowsInserted ??
            Number(filters.rows_inserted ?? "3");
          return {
            data: rows > 0
              ? [{
                sync_run_id: filters.sync_run_id ?? RUN_ID,
                rows_inserted: rowsInserted,
              }]
              : [],
            error: null,
          };
        });
        const originalEq = builder.eq;
        builder.eq = (col: string, value: string) => {
          filters[col] = value;
          return originalEq(col, value);
        };
        return builder;
      },
    }),
    rpc: async () => ({ data: 0, error: null }),
  };
  return { client, patchCalls };
}

Deno.test("evidence persistence: legacy patch succeeds when generation matches", async () => {
  const { client, patchCalls } = mockDb({
    feed: { sync_run_id: RUN_ID, rows_inserted: 3 },
    patchRows: 1,
  });
  const out = await persistTabEvaluationEvidenceAfterLegacyRpc(client, {
    syncRunId: RUN_ID,
    expectedRowsInserted: 3,
    tabEvaluationEvidence: SAMPLE_EVIDENCE,
  });
  assertEquals(out, { mode: "legacy_patch", persisted: true });
  assertEquals(patchCalls.length, 1);
  assertEquals(patchCalls[0].filters, {
    state_key: "current",
    sync_run_id: RUN_ID,
    rows_inserted: "3",
  });
});

Deno.test("evidence persistence: rejects sync_run_id mismatch (newer generation)", async () => {
  const { client, patchCalls } = mockDb({
    feed: { sync_run_id: OTHER_RUN, rows_inserted: 3 },
  });
  const out = await persistTabEvaluationEvidenceAfterLegacyRpc(client, {
    syncRunId: RUN_ID,
    expectedRowsInserted: 3,
    tabEvaluationEvidence: SAMPLE_EVIDENCE,
  });
  assertEquals(out.mode, "legacy_patch");
  if (out.mode === "legacy_patch") assertEquals(out.persisted, false);
  assertEquals(legacyPatchFailureReason(out), "generation_sync_run_mismatch");
  assertEquals(patchCalls.length, 0);
});

Deno.test("evidence persistence: rejects row count mismatch", async () => {
  const { client, patchCalls } = mockDb({
    feed: { sync_run_id: RUN_ID, rows_inserted: 99 },
  });
  const out = await persistTabEvaluationEvidenceAfterLegacyRpc(client, {
    syncRunId: RUN_ID,
    expectedRowsInserted: 3,
    tabEvaluationEvidence: SAMPLE_EVIDENCE,
  });
  assertEquals(legacyPatchFailureReason(out), "generation_row_count_mismatch");
  assertEquals(patchCalls.length, 0);
});

Deno.test("evidence persistence: no matching feed row", async () => {
  const { client } = mockDb({ feed: null });
  const out = await persistTabEvaluationEvidenceAfterLegacyRpc(client, {
    syncRunId: RUN_ID,
    expectedRowsInserted: 0,
    tabEvaluationEvidence: SAMPLE_EVIDENCE,
  });
  assertEquals(legacyPatchFailureReason(out), "no_matching_generation");
});

Deno.test("evidence persistence: missing evidence column", async () => {
  const { client } = mockDb({
    feed: { sync_run_id: RUN_ID, rows_inserted: 1 },
    patchError: 'column "tab_evaluation_evidence" does not exist',
  });
  const out = await persistTabEvaluationEvidenceAfterLegacyRpc(client, {
    syncRunId: RUN_ID,
    expectedRowsInserted: 1,
    tabEvaluationEvidence: SAMPLE_EVIDENCE,
  });
  assertEquals(legacyPatchFailureReason(out), "evidence_column_unavailable");
});

Deno.test("evidence persistence: patch return row mismatch fails closed", async () => {
  const { client } = mockDb({
    feed: { sync_run_id: RUN_ID, rows_inserted: 2 },
    patchReturnRowsInserted: 99,
  });
  const out = await persistTabEvaluationEvidenceAfterLegacyRpc(client, {
    syncRunId: RUN_ID,
    expectedRowsInserted: 2,
    tabEvaluationEvidence: SAMPLE_EVIDENCE,
  });
  assertEquals(legacyPatchFailureReason(out), "patch_return_mismatch");
});

Deno.test("evidence persistence: patch matched zero rows", async () => {
  const { client } = mockDb({
    feed: { sync_run_id: RUN_ID, rows_inserted: 1 },
    patchRows: 0,
  });
  const out = await persistTabEvaluationEvidenceAfterLegacyRpc(client, {
    syncRunId: RUN_ID,
    expectedRowsInserted: 1,
    tabEvaluationEvidence: SAMPLE_EVIDENCE,
  });
  assertEquals(legacyPatchFailureReason(out), "patch_no_matching_row");
});
