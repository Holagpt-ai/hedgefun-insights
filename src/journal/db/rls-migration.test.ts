import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TABLE_NAMES } from "./schema-inventory";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const MIGRATION_FILES = [
  "supabase/migrations/20260816190000_journal_foundation_schema.sql",
  "supabase/migrations/20260816190100_journal_rls_storage.sql",
  "supabase/migrations/20260816190200_journal_functions_backfill.sql",
];

function loadSql(): string {
  return MIGRATION_FILES.map((rel) => readFileSync(resolve(ROOT, rel), "utf8")).join("\n");
}

function hasEnableRls(sql: string, table: string): boolean {
  return sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
}

function isNameBoundary(sql: string, endIndex: number): boolean {
  const ch = sql[endIndex];
  return ch === undefined || /[\s;]/.test(ch);
}

function hasAuthUidPolicy(sql: string, table: string): boolean {
  const needle = `ON public.${table}`;
  let from = 0;
  while (from < sql.length) {
    const onIdx = sql.indexOf(needle, from);
    if (onIdx === -1) return false;
    if (!isNameBoundary(sql, onIdx + needle.length)) {
      from = onIdx + needle.length;
      continue;
    }
    const createIdx = sql.lastIndexOf("CREATE POLICY", onIdx);
    if (createIdx === -1 || onIdx - createIdx > 400) {
      from = onIdx + needle.length;
      continue;
    }
    const endIdx = sql.indexOf(";", onIdx);
    const block = sql.slice(createIdx, endIdx === -1 ? onIdx + 2500 : endIdx + 1);
    if (block.includes("auth.uid()")) return true;
    from = onIdx + needle.length;
  }
  return false;
}

describe("journal RLS migration inventory", () => {
  const sql = loadSql();

  it("lists unique journal table names", () => {
    expect(TABLE_NAMES.length).toBeGreaterThan(50);
    expect(new Set(TABLE_NAMES).size).toBe(TABLE_NAMES.length);
    for (const name of TABLE_NAMES) {
      expect(name.startsWith("journal_")).toBe(true);
    }
  });

  it("enables RLS on every user-owned journal_* table", () => {
    const missing = TABLE_NAMES.filter((table) => !hasEnableRls(sql, table));
    expect(missing).toEqual([]);
  });

  it("defines at least one auth.uid() policy per user-owned journal_* table", () => {
    const missing = TABLE_NAMES.filter((table) => !hasAuthUidPolicy(sql, table));
    expect(missing).toEqual([]);
  });

  it("defines journal-private object policies without creating the bucket", () => {
    expect(sql).toMatch(/journal-private/);
    expect(sql).toMatch(/must be private/i);
    expect(sql).toMatch(/intentionally does not create the bucket/i);
    expect(sql).not.toMatch(/INSERT\s+INTO\s+storage\.buckets/i);
    expect(sql).not.toMatch(/UPDATE\s+storage\.buckets/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+storage\.buckets/i);
    expect(sql).toMatch(/CREATE POLICY "journal_private_select_own"/);
    expect(sql).toMatch(/CREATE POLICY "journal_private_insert_own"/);
    expect(sql).toMatch(/CREATE POLICY "journal_private_update_own"/);
    expect(sql).toMatch(/CREATE POLICY "journal_private_delete_own"/);
  });

  it("scopes private objects to auth.uid() first folder and known prefixes", () => {
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\]\s*=\s*auth\.uid\(\)::text/);
    expect(sql).toMatch(/\(\s*'imports'\s*,\s*'attachments'\s*,\s*'exports'\s*\)/);
  });
});
