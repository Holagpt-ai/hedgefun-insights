import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TABLE_NAMES } from "./schema-inventory";
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

const NAME = loadProductionMigrationMap().segments.find(
  (segment) => segment.kind === "legacy-acl",
)!.productionFile;
const LEGACY = [
  "journal_trades",
  "journal_notes",
  "journal_equity_snapshots",
  "journal_stats_cache",
  "journal_imports",
] as const;

describe("legacy ACL hardening migration", () => {
  const files = listJournalMigrations();
  const sql = normalizeJournalSql(readFileSync(resolve(MIGRATIONS_DIR, NAME), "utf8"));
  const digest = extractIntegrityDigest(sql)!;
  const parts = extractTaggedStrings(sql, "journal_stmt");

  it("is registered as a single atomic runner-sized file", () => {
    expect(files).toContain(NAME);
    expect(Buffer.byteLength(sql, "utf8")).toBeLessThan(SIZE_LIMIT);
    expect(sql.includes("\r")).toBe(false);
    expect(digest).toMatch(/^[0-9a-f]{32}$/);
    expect(md5Parts(parts)).toBe(digest);
    expect(parts).toHaveLength(2);
  });

  it("embeds the canonical 77-table manifest and mutates only the five legacy tables", () => {
    expect(parts[0]).toContain("v_tables constant text[]");
    for (const table of TABLE_NAMES) {
      expect(parts[0]).toContain(`'${table}'`);
    }
    expect(TABLE_NAMES).toHaveLength(77);
    expect(parts[1]).not.toMatch(/journal_%/);
    expect(parts[1]).toMatch(/v_legacy constant text\[] := ARRAY\[/);
    for (const table of LEGACY) {
      expect(parts[1]).toContain(`'${table}'`);
    }
    expect(parts[1]).not.toContain("'journal_accounts'");
    expect(parts[1]).not.toContain("'journal_executions'");
    expect(sql).not.toMatch(/tablename LIKE 'journal_%'/);
  });

  it("revokes TRUNCATE, REFERENCES, and TRIGGER, and guards MAINTAIN behind PostgreSQL 17+", () => {
    expect(parts[1]).toMatch(
      /REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public\.%I FROM authenticated/,
    );
    expect(parts[1]).toMatch(/server_version_num'\)::integer >= 170000/);
    expect(parts[1]).toMatch(/REVOKE MAINTAIN ON TABLE public\.%I FROM authenticated/);
    expect(sql).not.toMatch(/REVOKE MAINTAIN ON TABLE public\.journal_/);
    expect(sql).not.toMatch(/\bGRANT (SELECT|ALL|INSERT|UPDATE|DELETE|TRUNCATE|REFERENCES|TRIGGER|MAINTAIN)\b/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).not.toMatch(/ALTER TABLE/i);
    expect(sql).not.toMatch(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION/i);
    expect(sql).not.toMatch(/journal_backfill_accounts_and_executions/);
    expect(sql).not.toMatch(/journal_migrate_legacy_trades/);
  });

  it("fails the digest when a statement is changed, removed, or reordered", () => {
    const changed = [...parts];
    changed[1] = `${changed[1]}-- mutated\n`;
    expect(md5Parts(changed)).not.toBe(digest);
    expect(md5Parts(parts.slice(0, 1))).not.toBe(digest);
    expect(md5Parts([parts[1], parts[0]])).not.toBe(digest);
  });
});
