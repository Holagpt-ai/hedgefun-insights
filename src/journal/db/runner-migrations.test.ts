import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractIntegrityDigest,
  extractTaggedStrings,
  listJournalMigrations,
  md5Parts,
  MIGRATIONS_DIR,
  readJournalSql,
  SIZE_LIMIT,
} from "./journal-sql";

const REPLACED = [
  "20260816190000_journal_foundation_schema.sql",
  "20260816190100_journal_rls_storage.sql",
  "20260816190200_journal_functions_backfill.sql",
];

describe("runner-native Journal migrations", () => {
  const files = listJournalMigrations();
  const allSql = readJournalSql();

  it("replaces the three oversized files and keeps versions after prior history", () => {
    const names = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort();
    for (const old of REPLACED) {
      expect(names).not.toContain(old);
    }
    const prior = names.filter((name) => name < "20260816191000");
    expect(prior.at(-1)).toBe("20260814180000_screener_52w_baseline_job.sql");
    expect(files[0]).toBe("20260816191000_journal_foundation_guard.sql");
    expect(files.every((name) => name > "20260814180000_screener_52w_baseline_job.sql")).toBe(true);
    expect(new Set(files).size).toBe(files.length);
  });

  it("keeps every production Journal migration within the runner size limit", () => {
    const oversized: string[] = [];
    for (const name of files) {
      const bytes = Buffer.byteLength(readFileSync(resolve(MIGRATIONS_DIR, name), "utf8"), "utf8");
      if (bytes > SIZE_LIMIT) oversized.push(`${name}=${bytes}`);
    }
    expect(oversized).toEqual([]);
  });

  it("recalculates every embedded integrity digest independently", () => {
    for (const name of files) {
      const sql = readFileSync(resolve(MIGRATIONS_DIR, name), "utf8");
      const expected = extractIntegrityDigest(sql);
      expect(expected, name).toMatch(/^[0-9a-f]{32}$/);
      const tag = name.includes("journal_rls_storage") ? "journal_man" : "journal_stmt";
      const parts = extractTaggedStrings(sql, tag);
      expect(parts.length, name).toBeGreaterThan(0);
      expect(md5Parts(parts)).toBe(expected);
      expect(sql).toContain(`v_expected text := '${expected}'`);
    }
  });

  it("fails the digest when a statement or manifest part is changed, removed, or reordered", () => {
    const sample = files.find((name) => name.includes("foundation_guard"));
    expect(sample).toBeTruthy();
    const sql = readFileSync(resolve(MIGRATIONS_DIR, sample!), "utf8");
    const parts = extractTaggedStrings(sql, "journal_stmt");
    const expected = extractIntegrityDigest(sql)!;
    const changed = [...parts];
    changed[0] = `${changed[0]}x`;
    expect(md5Parts(changed)).not.toBe(expected);
    expect(md5Parts(parts.slice(1))).not.toBe(expected);
    expect(md5Parts([...parts].reverse())).not.toBe(expected);
  });

  it("does not write storage.buckets, create public rollback tables, or auto-invoke backfill", () => {
    expect(allSql).not.toMatch(/INSERT\s+INTO\s+storage\.buckets/i);
    expect(allSql).not.toMatch(/UPDATE\s+storage\.buckets/i);
    expect(allSql).not.toMatch(/CREATE TABLE[\s\S]{0,160}public\.journal_rollback_/i);
    expect(allSql).not.toMatch(/PERFORM\s+public\.journal_backfill_accounts_and_executions/i);
    expect(allSql).not.toMatch(/PERFORM\s+public\.journal_migrate_legacy_trades/i);
    expect(allSql).not.toMatch(/tablename LIKE 'journal_%'/);
    expect(allSql).not.toMatch(/SELECT\s+public\.journal_backfill_accounts_and_executions\s*\(/i);
    expect(allSql).not.toMatch(/SELECT\s+public\.journal_migrate_legacy_trades\s*\(/i);
  });
});
