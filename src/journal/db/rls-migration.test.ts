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

  it("keeps journal-private storage bucket non-public", () => {
    expect(sql).toMatch(/journal-private/);
    expect(sql).toMatch(/VALUES\s*\(\s*'journal-private'\s*,\s*'journal-private'\s*,\s*false\s*\)/i);
    expect(sql).toMatch(/ON CONFLICT\s*\(\s*id\s*\)\s*DO UPDATE SET\s+public\s*=\s*false/i);
    expect(sql).not.toMatch(
      /INSERT INTO storage\.buckets[\s\S]{0,200}journal-private[\s\S]{0,80}\btrue\b/i,
    );
  });

  it("scopes private objects to auth.uid() first folder and known prefixes", () => {
    expect(sql).toMatch(/\(storage\.foldername\(name\)\)\[1\]\s*=\s*auth\.uid\(\)::text/);
    expect(sql).toMatch(/\(\s*'imports'\s*,\s*'attachments'\s*,\s*'exports'\s*\)/);
  });
});
