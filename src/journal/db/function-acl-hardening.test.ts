import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractIntegrityDigest,
  extractTaggedStrings,
  listJournalMigrations,
  md5Parts,
  MIGRATIONS_DIR,
  SIZE_LIMIT,
} from "./journal-sql";

const NAME = "20260816191400_journal_function_acl_hardening.sql";
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
  const sql = readFileSync(resolve(MIGRATIONS_DIR, NAME), "utf8");
  const digest = extractIntegrityDigest(sql)!;
  const parts = extractTaggedStrings(sql, "journal_stmt");
  const revokes = parts.filter((part) => part.startsWith("REVOKE ALL ON FUNCTION"));

  it("is registered after import finalize as a single atomic runner-sized file", () => {
    expect(files).toContain(NAME);
    expect(files.at(-1)).toBe(NAME);
    expect(files.indexOf("20260816191390_journal_fn_import_finalize.sql")).toBeLessThan(
      files.indexOf(NAME),
    );
    expect(Buffer.byteLength(sql, "utf8")).toBeLessThan(SIZE_LIMIT);
    expect(sql.endsWith("\n")).toBe(true);
    expect(sql.includes("\r")).toBe(false);
    expect(digest).toMatch(/^[0-9a-f]{32}$/);
    expect(md5Parts(parts)).toBe(digest);
    expect(parts.length).toBe(8);
    expect(revokes).toHaveLength(6);
  });

  it("revokes PUBLIC and anon EXECUTE from exactly the three operator signatures", () => {
    for (const sig of TARGETS) {
      expect(revokes.some((part) => part.includes(`public.${sig} FROM PUBLIC`))).toBe(true);
      expect(revokes.some((part) => part.includes(`public.${sig} FROM anon`))).toBe(true);
    }
    expect(sql).not.toMatch(/ON ALL FUNCTIONS/i);
    expect(sql).not.toMatch(/REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.journal_%/i);
    expect(sql).not.toMatch(/proname LIKE/i);
    expect(CANON).toHaveLength(9);
    for (const sig of CANON) {
      expect(parts[0]).toContain(`'${sig}'`);
      expect(parts[7]).toContain(`'${sig}'`);
    }
    expect(parts[0]).toMatch(/v_targets constant text\[] := ARRAY\[/);
    for (const sig of TARGETS) {
      expect(parts[0]).toContain(`'${sig}'`);
    }
  });

  it("does not change function bodies, table ACLs, policies, storage, or invoke backfill", () => {
    expect(sql).not.toMatch(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION/i);
    expect(sql).not.toMatch(/ALTER FUNCTION/i);
    expect(sql).not.toMatch(/DROP FUNCTION/i);
    expect(sql).not.toMatch(/ALTER FUNCTION[\s\S]{0,80}SECURITY DEFINER/i);
    expect(sql).not.toMatch(/\bGRANT (ALL|EXECUTE)\b/i);
    expect(sql).not.toMatch(/ALTER TABLE/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).not.toMatch(/storage\.buckets/i);
    expect(sql).not.toMatch(/PERFORM\s+/i);
    expect(sql).not.toMatch(/SELECT\s+public\.journal_/i);
  });

  it("fails the digest when a statement is changed, removed, or reordered", () => {
    const changed = [...parts];
    changed[1] = `${changed[1]} -- mutated\n`;
    expect(md5Parts(changed)).not.toBe(digest);
    expect(md5Parts(parts.slice(1))).not.toBe(digest);
    expect(md5Parts([parts[0], ...parts.slice(2), parts[1]])).not.toBe(digest);
  });
});
