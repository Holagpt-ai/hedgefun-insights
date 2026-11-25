/**
 * Layer C + Option B reconcile — validate_screener_feed_reconcile_evidence_v1 /
 * reconcile_screener_sync_staged_publish_v1 (migration 20261125203000).
 */

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertJsonbDeepEqual,
  layerCSixTabEvidenceEvaluated,
  layerCSixTabEvidenceOptionBDegradedGappers,
  sampleObservation,
  truncateStaging,
  validScreenerRow,
  withPg,
} from "./sync-staging-postgres-helpers.ts";

const OPTION_B_RECONCILE_MIGRATION = new URL(
  "../../../migrations/20261125203000_screener_option_b_reconcile_evidence_v1.sql",
  import.meta.url,
);

async function ensureOptionBReconcileMigration(
  client: Parameters<Parameters<typeof withPg>[0]>[0],
): Promise<void> {
  const exists = await client.queryObject<{ n: number }>(
    `SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'validate_screener_feed_reconcile_evidence_v1'`,
  );
  if ((exists.rows[0]?.n ?? 0) === 0) {
    const sql = await Deno.readTextFile(OPTION_B_RECONCILE_MIGRATION);
    await client.queryObject(sql);
  }
}

function optionBRowsWithoutGappers(syncedAt: string) {
  const nhl = {
    ...validScreenerRow("NHL1", "new_highs_lows", syncedAt),
    high_52w: "20",
    low_52w: "5",
    day_high: "21",
    day_low: "9",
    range_event: "new_high",
  };
  return [
    validScreenerRow("GL1", "gainers_losers", syncedAt),
    nhl,
    validScreenerRow("DTR1", "day_trade_radar", syncedAt),
    validScreenerRow("VS1", "volume_spikes", syncedAt),
    validScreenerRow("UV1", "unusual_volume", syncedAt),
  ];
}

async function seedStrandedFinalizingJob(
  client: Parameters<Parameters<typeof withPg>[0]>[0],
  input: {
    jobId: string;
    syncRunId: string;
    syncedAt: string;
    rows: ReturnType<typeof validScreenerRow>[];
    evidence: Record<string, unknown>;
    stateVersion?: number;
    jobEvidence?: Record<string, unknown> | null;
  },
): Promise<void> {
  await client.queryObject(
    `SELECT public.replace_screener_results_generation_v1(
      $1::jsonb, $2::uuid, $3::timestamptz, 'available', $4::jsonb
    )`,
    [
      JSON.stringify(input.rows),
      input.syncRunId,
      input.syncedAt,
      JSON.stringify(input.evidence),
    ],
  );
  await client.queryObject(
    `INSERT INTO public.screener_sync_generation_jobs
     (id, sync_run_id, status, observation, all_tickers, chunk_size, total_chunks,
      next_chunk_index, state_version, publish_rows_inserted, publish_rpc_recorded_at,
      tab_evaluation_evidence, finalize_lease_token, finalize_lease_expires_at)
     VALUES ($1, $2, 'finalizing', $3::jsonb, '[]'::jsonb, 2200, 7, 7, $4,
             $5, $6::timestamptz, $7::jsonb, $8::uuid, $9::timestamptz)`,
    [
      input.jobId,
      input.syncRunId,
      JSON.stringify({ ...sampleObservation(input.syncRunId), syncedAt: input.syncedAt }),
      input.stateVersion ?? 8,
      input.rows.length,
      input.syncedAt,
      input.jobEvidence === undefined
        ? JSON.stringify(input.evidence)
        : input.jobEvidence === null
        ? null
        : JSON.stringify(input.jobEvidence),
      crypto.randomUUID(),
      new Date(Date.parse(input.syncedAt) - 60_000).toISOString(),
    ],
  );
}

Deno.test({
  name: "Layer C+Option B: reconcile six-tab evaluated publication",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await ensureOptionBReconcileMigration(client);
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const syncedAt = "2026-11-25T18:30:00.000Z";
      const evidence = layerCSixTabEvidenceEvaluated();
      const rows = [validScreenerRow("AAA", "gappers", syncedAt)];
      await seedStrandedFinalizingJob(client, {
        jobId,
        syncRunId,
        syncedAt,
        rows,
        evidence,
      });
      const reconcile = await client.queryObject<{ payload: string }>(
        `SELECT public.reconcile_screener_sync_staged_publish_v1($1::uuid, 8, now())::text AS payload`,
        [jobId],
      );
      const parsed = JSON.parse(String(reconcile.rows[0]?.payload ?? "{}"));
      assertEquals(parsed.ok, true);
      assertEquals(parsed.reconcile_mode, "six_tab_evaluated");
      const status = await client.queryObject<{ status: string }>(
        `SELECT status FROM public.screener_sync_generation_jobs WHERE id = $1`,
        [jobId],
      );
      assertEquals(status.rows[0]?.status, "published");
    });
  },
});

Deno.test({
  name: "Layer C+Option B: reconcile legitimately published degraded Gappers",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await ensureOptionBReconcileMigration(client);
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const syncedAt = "2026-11-25T18:35:00.000Z";
      const evidence = layerCSixTabEvidenceOptionBDegradedGappers();
      const rows = optionBRowsWithoutGappers(syncedAt);
      await seedStrandedFinalizingJob(client, {
        jobId,
        syncRunId,
        syncedAt,
        rows,
        evidence,
      });
      const reconcile = await client.queryObject<{ payload: string }>(
        `SELECT public.reconcile_screener_sync_staged_publish_v1($1::uuid, 8, now())::text AS payload`,
        [jobId],
      );
      const parsed = JSON.parse(String(reconcile.rows[0]?.payload ?? "{}"));
      assertEquals(parsed.ok, true);
      assertEquals(parsed.reconcile_mode, "option_b_degraded_gappers");
    });
  },
});

Deno.test({
  name: "Layer C+Option B: reject degraded evidence with Gappers rows present",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await ensureOptionBReconcileMigration(client);
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const syncedAt = "2026-11-25T18:36:00.000Z";
      const evidence = layerCSixTabEvidenceOptionBDegradedGappers();
      const rows = [
        ...optionBRowsWithoutGappers(syncedAt),
        validScreenerRow("GAPX", "gappers", syncedAt),
      ];
      await seedStrandedFinalizingJob(client, {
        jobId,
        syncRunId,
        syncedAt,
        rows,
        evidence,
        stateVersion: 8,
      });
      const reconcile = await client.queryObject<{ payload: string }>(
        `SELECT public.reconcile_screener_sync_staged_publish_v1($1::uuid, 8, now())::text AS payload`,
        [jobId],
      );
      const parsed = JSON.parse(String(reconcile.rows[0]?.payload ?? "{}"));
      assertEquals(parsed.ok, false);
      assertEquals(parsed.reason, "option_b_gappers_rows_must_be_empty");
    });
  },
});

Deno.test({
  name: "Layer C+Option B: reject invalid degraded reason",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await ensureOptionBReconcileMigration(client);
      const evidence = {
        ...layerCSixTabEvidenceOptionBDegradedGappers(),
        gappers: {
          ...layerCSixTabEvidenceOptionBDegradedGappers().gappers,
          reason: "upstream_universe_empty",
        },
      };
      const gate = await client.queryObject<{ payload: string }>(
        `SELECT public.validate_screener_feed_reconcile_evidence_v1($1::jsonb, 0)::text AS payload`,
        [JSON.stringify(evidence)],
      );
      const parsed = JSON.parse(String(gate.rows[0]?.payload ?? "{}"));
      assertEquals(parsed.ok, false);
      assertEquals(parsed.reason, "tab_evidence_not_evaluated");
    });
  },
});

Deno.test({
  name: "Layer C+Option B: reject companion tabs not evaluated on candidate",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await ensureOptionBReconcileMigration(client);
      const evidence = {
        ...layerCSixTabEvidenceOptionBDegradedGappers(),
        new_highs_lows: {
          ...layerCSixTabEvidenceOptionBDegradedGappers().new_highs_lows,
          status: "not_evaluated",
          reason: "baseline_coverage_incomplete",
        },
      };
      const gate = await client.queryObject<{ payload: string }>(
        `SELECT public.validate_screener_feed_reconcile_evidence_v1($1::jsonb, 0)::text AS payload`,
        [JSON.stringify(evidence)],
      );
      const parsed = JSON.parse(String(gate.rows[0]?.payload ?? "{}"));
      assertEquals(parsed.ok, false);
      assertEquals(parsed.reason, "option_b_companion_tabs_not_evaluated");
    });
  },
});

Deno.test({
  name: "Layer C+Option B: reject published row count mismatch",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await ensureOptionBReconcileMigration(client);
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const syncedAt = "2026-11-25T18:37:00.000Z";
      const evidence = layerCSixTabEvidenceEvaluated();
      const rows = [validScreenerRow("AAA", "gappers", syncedAt)];
      await seedStrandedFinalizingJob(client, {
        jobId,
        syncRunId,
        syncedAt,
        rows,
        evidence,
      });
      await client.queryObject(
        `UPDATE public.screener_sync_generation_jobs SET publish_rows_inserted = 99 WHERE id = $1`,
        [jobId],
      );
      const reconcile = await client.queryObject<{ payload: string }>(
        `SELECT public.reconcile_screener_sync_staged_publish_v1($1::uuid, 8, now())::text AS payload`,
        [jobId],
      );
      const parsed = JSON.parse(String(reconcile.rows[0]?.payload ?? "{}"));
      assertEquals(parsed.ok, false);
      assertEquals(parsed.reason, "feed_row_count_mismatch");
    });
  },
});

Deno.test({
  name: "Layer C+Option B: reject job vs feed evidence mismatch",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await ensureOptionBReconcileMigration(client);
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const syncedAt = "2026-11-25T18:38:00.000Z";
      const feedEvidence = layerCSixTabEvidenceOptionBDegradedGappers();
      const jobEvidence = layerCSixTabEvidenceEvaluated();
      const rows = optionBRowsWithoutGappers(syncedAt);
      await seedStrandedFinalizingJob(client, {
        jobId,
        syncRunId,
        syncedAt,
        rows,
        evidence: feedEvidence,
        jobEvidence,
      });
      const reconcile = await client.queryObject<{ payload: string }>(
        `SELECT public.reconcile_screener_sync_staged_publish_v1($1::uuid, 8, now())::text AS payload`,
        [jobId],
      );
      const parsed = JSON.parse(String(reconcile.rows[0]?.payload ?? "{}"));
      assertEquals(parsed.ok, false);
      assertEquals(parsed.reason, "job_feed_evidence_mismatch");
    });
  },
});

Deno.test({
  name: "Layer C+Option B: idempotent reconcile",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await ensureOptionBReconcileMigration(client);
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const syncedAt = "2026-11-25T18:39:00.000Z";
      const evidence = layerCSixTabEvidenceEvaluated();
      const rows = [validScreenerRow("AAA", "gappers", syncedAt)];
      await seedStrandedFinalizingJob(client, {
        jobId,
        syncRunId,
        syncedAt,
        rows,
        evidence,
      });
      for (let i = 0; i < 2; i++) {
        const reconcile = await client.queryObject<{ payload: string }>(
          `SELECT public.reconcile_screener_sync_staged_publish_v1($1::uuid, 8, now())::text AS payload`,
          [jobId],
        );
        const parsed = JSON.parse(String(reconcile.rows[0]?.payload ?? "{}"));
        assertEquals(parsed.ok, true);
      }
    });
  },
});

Deno.test({
  name: "Layer C+Option B: reconcile persists job tab evidence from feed",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await ensureOptionBReconcileMigration(client);
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const syncedAt = "2026-11-25T18:40:00.000Z";
      const evidence = layerCSixTabEvidenceOptionBDegradedGappers();
      const rows = optionBRowsWithoutGappers(syncedAt);
      await seedStrandedFinalizingJob(client, {
        jobId,
        syncRunId,
        syncedAt,
        rows,
        evidence,
        jobEvidence: null,
      });
      const reconcile = await client.queryObject<{ payload: string }>(
        `SELECT public.reconcile_screener_sync_staged_publish_v1($1::uuid, 8, now())::text AS payload`,
        [jobId],
      );
      assertEquals(JSON.parse(String(reconcile.rows[0]?.payload ?? "{}")).ok, true);
      const stored = await client.queryObject<{ evidence: unknown }>(
        `SELECT tab_evaluation_evidence AS evidence FROM public.screener_sync_generation_jobs WHERE id = $1`,
        [jobId],
      );
      assertJsonbDeepEqual(stored.rows[0]?.evidence, evidence);
    });
  },
});

Deno.test({
  name: "Layer C+Option B: reject stale finalize lease (CAS path preserved)",
  ignore: !Deno.env.get("SCREENER_SYNC_PG_TEST_URL"),
  fn: async () => {
    await withPg(async (client) => {
      await ensureOptionBReconcileMigration(client);
      await truncateStaging(client);
      const jobId = crypto.randomUUID();
      const syncRunId = crypto.randomUUID();
      const syncedAt = "2026-11-25T18:41:00.000Z";
      const evidence = layerCSixTabEvidenceEvaluated();
      const rows = [validScreenerRow("AAA", "gappers", syncedAt)];
      await seedStrandedFinalizingJob(client, {
        jobId,
        syncRunId,
        syncedAt,
        rows,
        evidence,
      });
      await client.queryObject(
        `UPDATE public.screener_sync_generation_jobs
         SET finalize_lease_expires_at = now() + interval '10 minutes' WHERE id = $1`,
        [jobId],
      );
      const reconcile = await client.queryObject<{ payload: string }>(
        `SELECT public.reconcile_screener_sync_staged_publish_v1($1::uuid, 8, now())::text AS payload`,
        [jobId],
      );
      const parsed = JSON.parse(String(reconcile.rows[0]?.payload ?? "{}"));
      assertEquals(parsed.ok, false);
      assertEquals(parsed.reason, "finalize_lease_still_active");
    });
  },
});