#!/usr/bin/env node
/**
 * Regression: Gate H remediation RPCs must not be executable by anon/authenticated.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20261023103000_sec_v1c_attribution_remediation_v1.sql",
);

const APPLY_SIG = "public.apply_sec_v1c_attribution_invalidation(jsonb, text, boolean)";
const ROLLBACK_SIG = "public.rollback_sec_v1c_attribution_invalidation(uuid, boolean)";

const REVOKE_PATTERN =
  /REVOKE ALL ON FUNCTION public\.(apply_sec_v1c_attribution_invalidation|rollback_sec_v1c_attribution_invalidation)\([^)]+\) FROM PUBLIC, anon, authenticated;/g;

export function verifySecV1cRemediationRpcAcl(sqlText = readFileSync(MIGRATION, "utf8")) {
  const errors = [];

  if (!sqlText.includes(`REVOKE ALL ON FUNCTION ${APPLY_SIG} FROM PUBLIC, anon, authenticated;`)) {
    errors.push(`missing explicit REVOKE for ${APPLY_SIG} from PUBLIC, anon, authenticated`);
  }
  if (!sqlText.includes(`REVOKE ALL ON FUNCTION ${ROLLBACK_SIG} FROM PUBLIC, anon, authenticated;`)) {
    errors.push(`missing explicit REVOKE for ${ROLLBACK_SIG} from PUBLIC, anon, authenticated`);
  }

  const revokes = [...sqlText.matchAll(REVOKE_PATTERN)];
  if (revokes.length !== 2) {
    errors.push(`expected 2 PUBLIC/anon/authenticated REVOKE statements, found ${revokes.length}`);
  }

  if (!sqlText.includes(`GRANT EXECUTE ON FUNCTION ${APPLY_SIG} TO service_role;`)) {
    errors.push(`missing GRANT EXECUTE TO service_role for apply RPC`);
  }
  if (!sqlText.includes(`GRANT EXECUTE ON FUNCTION ${ROLLBACK_SIG} TO service_role;`)) {
    errors.push(`missing GRANT EXECUTE TO service_role for rollback RPC`);
  }

  for (const fn of [
    "apply_sec_v1c_attribution_invalidation",
    "rollback_sec_v1c_attribution_invalidation",
  ]) {
    const block = sqlText.match(
      new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}[\\s\\S]*?\\$\\$;`, "m"),
    )?.[0] ?? "";
    if (!block.includes("SECURITY DEFINER")) {
      errors.push(`${fn} must remain SECURITY DEFINER`);
    }
    if (!block.includes("SET search_path = public")) {
      errors.push(`${fn} must SET search_path = public`);
    }
  }

  return { ok: errors.length === 0, errors };
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  const result = verifySecV1cRemediationRpcAcl();
  if (!result.ok) {
    console.error("SEC V1C remediation RPC ACL verification FAILED:");
    for (const e of result.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("SEC V1C remediation RPC ACL verification ok");
}
