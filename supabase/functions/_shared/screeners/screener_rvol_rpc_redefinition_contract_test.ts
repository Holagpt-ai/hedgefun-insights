// Static contract: Sprint 1B RPC redefinitions vs pre-Sprint authoritative migrations.
// Does not assert total historical definition counts (Lovable-safe).

import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const SPRINT_VOLUME_REL =
  "../../../migrations/20260917180000_screener_daily_volume_baseline_v1.sql";
const SPRINT_RESULTS_REL =
  "../../../migrations/20260917180200_screener_rvol20d_results_rpc_v1.sql";

const REDEFINITIONS: Array<{
  rpc: string;
  previousMigration: string;
  sprintMigration: string;
  requiredPreserved: string[];
  allowedAdditions: string[];
}> = [
  {
    rpc: "start_screener_52w_baseline_job_v1",
    previousMigration: "20260814180000_screener_52w_baseline_job.sql",
    sprintMigration: "20260917180000_screener_daily_volume_baseline_v1.sql",
    requiredPreserved: [
      "dates_total",
      "resumed",
      "screener_52w_baseline_job",
      "job_key = 'current'",
    ],
    allowedAdditions: [
      "copy_screener_daily_volume_history_from_current_v1",
      "screener_daily_volume_history",
      "current_generation_id",
    ],
  },
  {
    rpc: "finalize_screener_52w_baseline_job_v1",
    previousMigration: "20260915180000_screener_prerequisite_eligibility_v1.sql",
    sprintMigration: "20260917180000_screener_daily_volume_baseline_v1.sql",
    requiredPreserved: [
      "replace_screener_52w_baseline_generation_with_exclusions_v1",
      "policy_excluded_count",
      "policy_min_sessions",
      "job incomplete",
    ],
    allowedAdditions: [
      "publish_screener_volume_baselines_v1",
      "volume_baseline_count",
    ],
  },
  {
    rpc: "replace_screener_52w_baseline_generation_v1",
    previousMigration: "20260915180000_screener_prerequisite_eligibility_v1.sql",
    sprintMigration: "20260917180000_screener_daily_volume_baseline_v1.sql",
    requiredPreserved: [
      "screener_52w_baseline_state",
      "policy_min_sessions = NULL",
      "policy_excluded_count = NULL",
      "screener_52w_baseline_exclusions",
    ],
    allowedAdditions: ["cleanup_stale_screener_volume_generations_v1"],
  },
  {
    rpc: "start_screener_52w_baseline_publish_v1",
    previousMigration: "20260915200000_screener_52w_baseline_chunked_publish_v1.sql",
    sprintMigration: "20260917180000_screener_daily_volume_baseline_v1.sql",
    requiredPreserved: [
      "expected_baseline_count",
      "expected_exclusion_count",
      "screener_52w_baseline_publish_job",
      "generation metadata mismatch",
    ],
    allowedAdditions: [
      "copy_screener_daily_volume_history_from_current_v1",
      "current_generation_id",
    ],
  },
  {
    rpc: "finalize_screener_52w_baseline_publish_v1",
    previousMigration: "20260916010000_screener_52w_set_based_finalizer_v1.sql",
    sprintMigration: "20260917180000_screener_daily_volume_baseline_v1.sql",
    requiredPreserved: [
      "v_state.current_generation_id IS NOT DISTINCT FROM p_generation_id",
      "wrong generation",
      "INSERT INTO public.screener_52w_baselines",
      "policy_min_sessions",
      "policy_excluded_count",
    ],
    allowedAdditions: [
      "publish_screener_volume_baselines_v1",
      "cleanup_stale_screener_volume_generations_v1",
    ],
  },
  {
    rpc: "replace_screener_results_generation_v1",
    previousMigration: "20260914200000_screener_tab_evaluation_evidence_v1.sql",
    sprintMigration: "20260917180200_screener_rvol20d_results_rpc_v1.sql",
    requiredPreserved: [
      "tab_evaluation_evidence",
      "new_highs_lows",
      "legacy rvol must be null",
      "legacy avg_volume must be null",
      "day_high and day_low must both be null or both set",
      "nhl_baseline_status",
    ],
    allowedAdditions: [
      "avg_volume_20d",
      "rvol_20d",
      "v_rvol_tabs",
    ],
  },
];

async function load(rel: string): Promise<string> {
  const raw = await Deno.readTextFile(new URL(rel, import.meta.url));
  return raw.replaceAll("\r\n", "\n");
}

function functionBody(sql: string, rpcName: string): string {
  const marker = `CREATE OR REPLACE FUNCTION public.${rpcName}`;
  const start = sql.lastIndexOf(marker);
  assert(start >= 0, `missing ${rpcName} in migration`);
  const begin = sql.indexOf("AS $", start);
  assert(begin >= 0, `missing body for ${rpcName}`);
  const endMarkers = ["$fn$;", "$copy$;", "$pub$;", "$append$;", "$trim$;", "$cleanup$;"];
  let end = -1;
  for (const m of endMarkers) {
    const idx = sql.indexOf(m, begin + 1);
    if (idx > begin && (end < 0 || idx < end)) end = idx;
  }
  assert(end > begin, `missing end for ${rpcName}`);
  return sql.slice(begin, end);
}

async function latestMigrationDefining(rpc: string): Promise<string> {
  const migrationsDir = new URL("../../../migrations/", import.meta.url);
  let latest = "";
  for await (const entry of Deno.readDir(migrationsDir)) {
    if (!entry.isFile || !entry.name.endsWith(".sql")) continue;
    const sql = await Deno.readTextFile(new URL(entry.name, migrationsDir));
    if (sql.includes(`CREATE OR REPLACE FUNCTION public.${rpc}`)) {
      if (entry.name > latest) latest = entry.name;
    }
  }
  return latest;
}

for (const spec of REDEFINITIONS) {
  Deno.test(`static: ${spec.rpc} latest definition is Sprint 1B migration`, async () => {
    assertEquals(await latestMigrationDefining(spec.rpc), spec.sprintMigration);
  });

  Deno.test(`static: ${spec.rpc} preserves pre-Sprint behavior`, async () => {
    const prevSql = await load(`../../../migrations/${spec.previousMigration}`);
    const sprintSql = await load(
      spec.sprintMigration === "20260917180200_screener_rvol20d_results_rpc_v1.sql"
        ? SPRINT_RESULTS_REL
        : SPRINT_VOLUME_REL,
    );
    const prevBody = functionBody(prevSql, spec.rpc);
    const sprintBody = functionBody(sprintSql, spec.rpc);
    for (const needle of spec.requiredPreserved) {
      assert(
        prevBody.includes(needle),
        `previous ${spec.rpc} missing expected ${needle}`,
      );
      assert(
        sprintBody.includes(needle),
        `sprint ${spec.rpc} dropped preserved behavior: ${needle}`,
      );
    }
    for (const needle of spec.allowedAdditions) {
      assert(
        sprintBody.includes(needle),
        `sprint ${spec.rpc} missing intended addition: ${needle}`,
      );
    }
  });
}

Deno.test("static: finalize retains current-generation rolling history after publish", async () => {
  const sql = await load(SPRINT_VOLUME_REL);
  const cronFinalize = functionBody(sql, "finalize_screener_52w_baseline_job_v1");
  const workerFinalize = functionBody(sql, "finalize_screener_52w_baseline_publish_v1");
  assertFalse(cronFinalize.includes("DELETE FROM public.screener_daily_volume_history"));
  assertFalse(workerFinalize.includes("DELETE FROM public.screener_daily_volume_history"));
});

Deno.test("static: cleanup keeps generation_id parameter and IS DISTINCT FROM keep guard", async () => {
  const sql = await load(SPRINT_VOLUME_REL);
  const body = functionBody(sql, "cleanup_stale_screener_volume_generations_v1");
  assert(body.includes("p_keep_generation_id"));
  assert(body.includes("IS DISTINCT FROM p_keep_generation_id"));
});

Deno.test("static: job_dates primary key is generation-scoped", async () => {
  const sql = await load(SPRINT_VOLUME_REL);
  assert(sql.includes("PRIMARY KEY (generation_id, session_date)"));
  assert(sql.includes("Same session_date in generation A does not block generation B"));
});

Deno.test("static: copy-forward RPC exists and reads current_generation_id", async () => {
  const sql = await load(SPRINT_VOLUME_REL);
  const body = functionBody(sql, "copy_screener_daily_volume_history_from_current_v1");
  assert(body.includes("screener_52w_baseline_state"));
  assert(body.includes("current_generation_id"));
  assert(body.includes("screener_daily_volume_history"));
});

Deno.test("static: screener results RPC adds RVOL columns without dropping NHL guards", async () => {
  const prev = await load("../../../migrations/20260914200000_screener_tab_evaluation_evidence_v1.sql");
  const sprint = await load(SPRINT_RESULTS_REL);
  const prevBody = functionBody(prev, "replace_screener_results_generation_v1");
  const sprintBody = functionBody(sprint, "replace_screener_results_generation_v1");
  assert(sprintBody.includes("avg_volume_20d"));
  assert(sprintBody.includes("rvol_20d"));
  assert(sprintBody.includes("v_rvol_tabs"));
  assert(prevBody.includes("new_highs_lows rows require available baseline"));
  assert(sprintBody.includes("new_highs_lows rows require available baseline"));
  assert(prevBody.includes("synced_at implausible"));
  assert(sprintBody.includes("synced_at implausible"));
});
