import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractIntegrityDigest,
  extractTaggedStrings,
  listJournalMigrations,
  loadProductionMigrationMap,
  md5Parts,
  MIGRATIONS_DIR,
  normalizeJournalSql,
  SIZE_LIMIT,
} from "./journal-sql";

const MAP = loadProductionMigrationMap();
const NAME = MAP.segments.find((segment) => segment.kind === "function-acl")!.productionFile;
const IMPORT_FINALIZE = MAP.segments.find(
  (segment) => segment.formerFile === "20260816191390_journal_fn_import_finalize.sql",
)!.productionFile;
const TARGETS = [
  "journal_backfill_accounts_and_executions(uuid)",
  "journal_migrate_legacy_trades()",
  "journal_import_rollback(uuid)",
] as const;
const CANON = [
  "journal_calculate_trade_v1(uuid)",
  "journal_refresh_derived(uuid)",
  "journal_backfill_accounts_and_executions(uuid)",
  "journal_migrate_legacy_trades()",
  "journal_import_rollback(uuid)",
  "journal_save_trade_v1(jsonb)",
  "journal_import_start_v1(jsonb)",
  "journal_import_row_v1(uuid, uuid, jsonb)",
  "journal_import_finalize_v1(uuid)",
] as const;

describe("function ACL hardening migration", () => {
  const files = listJournalMigrations();
  const sql = normalizeJournalSql(readFileSync(resolve(MIGRATIONS_DIR, NAME), "utf8"));
  const digest = extractIntegrityDigest(sql)!;
  const parts = extractTaggedStrings(sql, "journal_stmt");
  const revokes = parts.filter((part) => part.startsWith("REVOKE ALL ON FUNCTION"));

  it("is registered after import finalize as a single atomic runner-sized file", () => {
    expect(files).toContain(NAME);
    expect(files.at(-1)).toBe(NAME);
    expect(files.indexOf(IMPORT_FINALIZE)).toBeLessThan(files.indexOf(NAME));
    expect(Buffer.byteLength(sql, "utf8")).toBeLessThan(SIZE_LIMIT);
    expect(sql.includes("\r")).toBe(false);
    expect(digest).toMatch(/^[0-9a-f]{32}$/);
    expect(md5Parts(parts)).toBe(digest);
    expect(parts.length).toBe(14);
    expect(revokes).toHaveLength(12);
  });

  it("revokes PUBLIC from the three targets and anon from all nine signatures", () => {
    const publicRevokes = revokes.filter((part) => part.includes(" FROM PUBLIC"));
    const anonRevokes = revokes.filter((part) => part.includes(" FROM anon"));
    expect(publicRevokes).toHaveLength(3);
    expect(anonRevokes).toHaveLength(9);
    for (const sig of TARGETS) {
      expect(publicRevokes.some((part) => part.includes(`public.${sig} FROM PUBLIC`))).toBe(true);
    }
    for (const sig of CANON) {
      expect(anonRevokes.some((part) => part.includes(`public.${sig} FROM anon`))).toBe(true);
    }
    expect(sql).not.toMatch(/ON ALL FUNCTIONS/i);
    expect(sql).not.toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.journal_%/i);
    expect(sql).not.toMatch(/FROM authenticated/);
    expect(sql).not.toMatch(/FROM service_role/);
    expect(sql).not.toMatch(/FROM sandbox_exec_zcjptaolpumhtlwhlemq/);
    expect(sql).not.toMatch(/REVOKE\s+.*\s+ON TABLE/i);
    expect(sql).toContain("sandbox_exec_zcjptaolpumhtlwhlemq");
    expect(sql).toMatch(/SELECT\/INSERT table ACL footprint/);
    expect(revokes).toEqual([
      "REVOKE ALL ON FUNCTION public.journal_backfill_accounts_and_executions(uuid) FROM PUBLIC\n",
      "REVOKE ALL ON FUNCTION public.journal_migrate_legacy_trades() FROM PUBLIC\n",
      "REVOKE ALL ON FUNCTION public.journal_import_rollback(uuid) FROM PUBLIC\n",
      "REVOKE ALL ON FUNCTION public.journal_calculate_trade_v1(uuid) FROM anon\n",
      "REVOKE ALL ON FUNCTION public.journal_refresh_derived(uuid) FROM anon\n",
      "REVOKE ALL ON FUNCTION public.journal_backfill_accounts_and_executions(uuid) FROM anon\n",
      "REVOKE ALL ON FUNCTION public.journal_migrate_legacy_trades() FROM anon\n",
      "REVOKE ALL ON FUNCTION public.journal_import_rollback(uuid) FROM anon\n",
      "REVOKE ALL ON FUNCTION public.journal_save_trade_v1(jsonb) FROM anon\n",
      "REVOKE ALL ON FUNCTION public.journal_import_start_v1(jsonb) FROM anon\n",
      "REVOKE ALL ON FUNCTION public.journal_import_row_v1(uuid, uuid, jsonb) FROM anon\n",
      "REVOKE ALL ON FUNCTION public.journal_import_finalize_v1(uuid) FROM anon\n",
    ]);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION preserves existing ACLs/);
    expect(sql).toMatch(/DROP FUNCTION followed by CREATE FUNCTION/);
    expect(CANON).toHaveLength(9);
  });

  it("does not change function bodies, table ACLs, policies, storage, or invoke backfill", () => {
    const body = parts.join("\n");
    expect(body).not.toMatch(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION/i);
    expect(body).not.toMatch(/ALTER FUNCTION/i);
    expect(body).not.toMatch(/DROP FUNCTION/i);
    expect(body).not.toMatch(/\bGRANT (ALL|EXECUTE)\b/i);
    expect(body).not.toMatch(/ALTER TABLE/i);
    expect(body).not.toMatch(/ALTER DEFAULT PRIVILEGES/);
    expect(body).not.toMatch(/CREATE POLICY/i);
    expect(body).not.toMatch(/DROP POLICY/i);
    expect(body).not.toMatch(/storage\.buckets/i);
    expect(body).not.toMatch(/PERFORM\s+/i);
    expect(body).not.toMatch(/SELECT\s+public\.journal_/i);
  });

  it("fails the digest when a statement is changed, removed, or reordered", () => {
    const changed = [...parts];
    changed[1] = `${changed[1]} -- mutated\n`;
    expect(md5Parts(changed)).not.toBe(digest);
    expect(md5Parts(parts.slice(1))).not.toBe(digest);
    expect(md5Parts([parts[0], ...parts.slice(2), parts[1]])).not.toBe(digest);
  });
});
