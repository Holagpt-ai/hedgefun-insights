/**
 * Gate H — apply or preview SEC V1C misattribution invalidation from curated allowlist CSV.
 * Default: --dry-run (no writes). Requires migration 20261023103000 applied + service DB URL.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  loadDotEnvFiles,
  openProductionSql,
  requireProductionDatabaseUrl,
} from "../../src/lib/persistence/production-database.ts";
import { SEC_V1C_REMEDIATION_POLICY_VERSION } from "../../supabase/functions/_shared/sec-edgar/sec-v1c-historical-classification.ts";

loadDotEnvFiles();

type AllowlistRow = {
  dedupe_key: string;
  reason: string;
  reviewed_by: string;
  reviewed_at: string;
};

function parseArgs(argv: string[]): { dryRun: boolean; apply: boolean; csvPath: string } {
  const dryRun = !argv.includes("--apply");
  const apply = argv.includes("--apply");
  const csvFlag = argv.findIndex((a) => a === "--csv");
  const csvPath = csvFlag >= 0 && argv[csvFlag + 1]
    ? resolve(argv[csvFlag + 1])
    : resolve("docs/sec-edgar/remediation/sec-v1c-misattribution-allowlist.csv");
  return { dryRun, apply, csvPath };
}

function parseAllowlistCsv(text: string): AllowlistRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];
  const header = lines[0].split(",").map((h) => h.trim());
  const idx = {
    dedupe_key: header.indexOf("dedupe_key"),
    reason: header.indexOf("reason"),
    reviewed_by: header.indexOf("reviewed_by"),
    reviewed_at: header.indexOf("reviewed_at"),
  };
  if (idx.dedupe_key < 0 || idx.reason < 0) {
    throw new Error("allowlist CSV must include dedupe_key and reason columns");
  }
  const rows: AllowlistRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    const dedupe_key = cols[idx.dedupe_key]?.trim();
    const reason = cols[idx.reason]?.trim();
    if (!dedupe_key || !reason) continue;
    rows.push({
      dedupe_key,
      reason,
      reviewed_by: idx.reviewed_by >= 0 ? (cols[idx.reviewed_by]?.trim() ?? "ops") : "ops",
      reviewed_at: idx.reviewed_at >= 0 ? (cols[idx.reviewed_at]?.trim() ?? new Date().toISOString()) : new Date().toISOString(),
    });
  }
  return rows;
}

async function main(): Promise<void> {
  const { dryRun, apply, csvPath } = parseArgs(process.argv.slice(2));
  if (apply && dryRun) throw new Error("invalid flags");
  const allowlist = parseAllowlistCsv(readFileSync(csvPath, "utf8"));
  if (allowlist.length === 0) {
    throw new Error(`allowlist empty at ${csvPath} — run sec-v1c-misattribution-classify.ts first`);
  }

  const items = allowlist.map((r) => ({
    dedupe_key: r.dedupe_key,
    reason: r.reason,
    reviewed_by: r.reviewed_by,
    reviewed_at: r.reviewed_at,
  }));

  const sql = openProductionSql(requireProductionDatabaseUrl());
  try {
    const [result] = await sql<
      {
        apply_sec_v1c_attribution_invalidation: Record<string, unknown>;
      }[]
    >`
      SELECT public.apply_sec_v1c_attribution_invalidation(
        ${sql.json(items)}::jsonb,
        ${SEC_V1C_REMEDIATION_POLICY_VERSION},
        ${dryRun}
      ) AS apply_sec_v1c_attribution_invalidation
    `;

    const payload = result?.apply_sec_v1c_attribution_invalidation ?? {};
    console.log(JSON.stringify({
      mode: dryRun ? "dry_run" : "apply",
      csvPath,
      allowlist_rows: allowlist.length,
      rpc: payload,
    }, null, 2));

    if (!dryRun) {
      console.error("APPLY completed — store batch_id from rpc output for rollback.");
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
