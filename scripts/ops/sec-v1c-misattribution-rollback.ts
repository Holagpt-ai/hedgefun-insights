/**
 * Gate H rollback helper — dry-run or apply rollback_sec_v1c_attribution_invalidation.
 */
import {
  loadDotEnvFiles,
  openProductionSql,
  requireProductionDatabaseUrl,
} from "../../src/lib/persistence/production-database.ts";

loadDotEnvFiles();

function parseArgs(argv: string[]): { batchId: string; apply: boolean } {
  const apply = argv.includes("--apply");
  const idx = argv.findIndex((a) => a === "--batch-id");
  const batchId = idx >= 0 ? argv[idx + 1]?.trim() : "";
  if (!batchId) throw new Error("--batch-id <uuid> required");
  return { batchId, apply };
}

async function main(): Promise<void> {
  const { batchId, apply } = parseArgs(process.argv.slice(2));
  const dryRun = !apply;
  const sql = openProductionSql(requireProductionDatabaseUrl());
  try {
    const [result] = await sql<
      { rollback_sec_v1c_attribution_invalidation: Record<string, unknown> }[]
    >`
      SELECT public.rollback_sec_v1c_attribution_invalidation(
        ${batchId}::uuid,
        ${dryRun}
      ) AS rollback_sec_v1c_attribution_invalidation
    `;
    console.log(JSON.stringify({
      mode: dryRun ? "dry_run" : "apply",
      batchId,
      rpc: result?.rollback_sec_v1c_attribution_invalidation ?? {},
    }, null, 2));
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
