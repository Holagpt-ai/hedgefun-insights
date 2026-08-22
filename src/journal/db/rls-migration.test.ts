import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readJournalSql } from "./journal-sql";
import { TABLE_NAMES } from "./schema-inventory";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const LIVE_TABLES = [
  "journal_trades",
  "journal_notes",
  "journal_equity_snapshots",
  "journal_stats_cache",
  "journal_imports",
];

function loadSql(): string {
  return readJournalSql("all");
}

describe("journal RLS migration inventory", () => {
  const sql = loadSql();
  const rls = readJournalSql("policy");

  it("lists unique journal table names", () => {
    expect(TABLE_NAMES.length).toBeGreaterThan(50);
    expect(new Set(TABLE_NAMES).size).toBe(TABLE_NAMES.length);
    for (const name of TABLE_NAMES) {
      expect(name.startsWith("journal_")).toBe(true);
    }
  });

  it("enables RLS on every user-owned journal_* table", () => {
    expect(rls).toMatch(/ALTER TABLE public\.%I ENABLE ROW LEVEL SECURITY/);
    const missing = TABLE_NAMES.filter((table) => !rls.includes(`'${table}'`));
    expect(missing).toEqual([]);
  });

  it("defines auth.uid() policies from the compact table manifest", () => {
    expect(rls).toContain("user_id = auth.uid()");
    expect(rls).toContain("auth.uid()");
    const missing = TABLE_NAMES.filter((table) => !rls.includes(`'${table}'`));
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

describe("journal foundation fail-closed Migration 1", () => {
  const schema = readJournalSql("foundation");
  const firstCreate = schema.search(/CREATE TABLE IF NOT EXISTS public\.journal_/);
  const revokeIdx = schema.search(
    /ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon/,
  );
  const restoreIdx = schema.lastIndexOf(
    "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon",
  );
  const lastCreate = schema.lastIndexOf("CREATE TABLE IF NOT EXISTS public.");

  it("quarantines default table privileges before the first CREATE TABLE", () => {
    expect(firstCreate).toBeGreaterThan(-1);
    expect(revokeIdx).toBeGreaterThan(-1);
    expect(revokeIdx).toBeLessThan(firstCreate);
    expect(schema).toMatch(
      /ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated/,
    );
    expect(schema).toMatch(
      /ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC/,
    );
  });

  it("restores anon and authenticated table defaults after every CREATE TABLE", () => {
    expect(restoreIdx).toBeGreaterThan(lastCreate);
    expect(schema).toMatch(
      /ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated/,
    );
    expect(schema).not.toMatch(
      /ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC/,
    );
  });

  it("does not drop or rewrite policies on the five live Journal tables", () => {
    for (const table of LIVE_TABLES) {
      expect(schema).not.toMatch(new RegExp(`DROP POLICY[\\s\\S]{0,80}ON public\\.${table}`));
      expect(schema).not.toMatch(new RegExp(`CREATE POLICY[\\s\\S]{0,80}ON public\\.${table}`));
    }
  });

  it("hardens an exact created-table allowlist instead of journal_% wildcards", () => {
    expect(schema).not.toMatch(/REVOKE ALL ON TABLE[^;]*journal_%/);
    expect(schema).not.toMatch(/tablename LIKE 'journal_%'/);
    const created = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z0-9_]+)/g)].map(
      (match) => match[1],
    );
    expect(created).toEqual(TABLE_NAMES);
    for (const name of TABLE_NAMES) {
      expect(schema).toContain(`'${name}'`);
    }
  });

  it("creates no functions, sequences, views, types, or SECURITY DEFINER objects", () => {
    expect(schema).not.toMatch(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION/i);
    expect(schema).not.toMatch(/CREATE\s+SEQUENCE/i);
    expect(schema).not.toMatch(/CREATE(?:\s+OR\s+REPLACE)?\s+VIEW/i);
    expect(schema).not.toMatch(/CREATE\s+MATERIALIZED\s+VIEW/i);
    expect(schema).not.toMatch(/CREATE\s+TYPE/i);
    expect(schema).not.toMatch(/SECURITY\s+DEFINER/i);
    expect(schema).not.toMatch(
      /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION[\s\S]{0,80}set_updated_at/i,
    );
    expect(schema).toMatch(/to_regprocedure\('public\.set_updated_at\(\)'\)/);
    expect(schema).toMatch(/EXECUTE FUNCTION public\.set_updated_at\(\)/);
  });

  it("treats the five pre-existing live tables separately from newly created tables", () => {
    expect(schema).toMatch(
      /v_live constant text\[] := ARRAY\[\s*'journal_trades',\s*'journal_notes',\s*'journal_equity_snapshots',\s*'journal_stats_cache',\s*'journal_imports'\s*\]/,
    );
    const created = [...schema.matchAll(/CREATE TABLE IF NOT EXISTS public\.([a-z0-9_]+)/g)].map(
      (match) => match[1],
    );
    expect(created).toHaveLength(77);
    expect(created.filter((name) => !LIVE_TABLES.includes(name))).toHaveLength(72);
  });

  it("preflights live RLS and auth.uid() policies before creating objects", () => {
    expect(schema.indexOf("preflight:")).toBeGreaterThan(-1);
    expect(schema.indexOf("preflight:")).toBeLessThan(firstCreate);
    expect(schema).toMatch(/Users can manage own notes/);
    expect(schema).toMatch(/relrowsecurity/);
  });

  it("hardens new tables before restoring default privileges", () => {
    const hardenIdx = schema.indexOf("-- Harden tables created by this migration");
    expect(hardenIdx).toBeGreaterThan(lastCreate);
    expect(hardenIdx).toBeLessThan(restoreIdx);
    expect(schema).toMatch(/REVOKE ALL ON TABLE public\.%I FROM anon/);
    expect(schema).toMatch(/REVOKE ALL ON TABLE public\.%I FROM authenticated/);
    expect(schema).toMatch(/REVOKE ALL ON TABLE public\.%I FROM PUBLIC/);
    expect(schema).toMatch(/GRANT ALL ON TABLE public\.%I TO service_role/);
    expect(schema).toMatch(/IF t = ANY \(v_live\)/);
  });

  it("does not create public rollback checkpoint tables", () => {
    expect(schema).not.toMatch(/CREATE TABLE[\s\S]{0,80}public\.journal_rollback_/i);
  });
});

describe("journal atomic Migration 2", () => {
  const rls = readJournalSql("policy");
  const fnSql = readJournalSql("functions");
  const allSql = loadSql();

  it("does not globally drop journal_% policies", () => {
    expect(rls).not.toMatch(/tablename LIKE 'journal_%'/);
    expect(rls).not.toMatch(/DROP POLICY IF EXISTS %I ON %I\.%I/);
    expect(rls).not.toMatch(/^DROP POLICY /m);
    expect(rls).not.toMatch(/^CREATE POLICY /m);
  });

  it("preflights unexpected policies before any DROP POLICY", () => {
    const pre = rls.indexOf("preflight: unexpected policy");
    const firstDrop = rls.indexOf("DROP POLICY IF EXISTS");
    expect(pre).toBeGreaterThan(-1);
    expect(firstDrop).toBeGreaterThan(pre);
    expect(rls).toMatch(/WHERE p\.schemaname = 'public'/);
    const beforeStorageDrop = rls.slice(0, rls.indexOf("DROP POLICY IF EXISTS %I ON storage"));
    expect(beforeStorageDrop).not.toMatch(/FROM pg_policies p\s+WHERE p\.schemaname = 'storage'/);
    const legacy = [
      ["journal_trades", "Users can manage own trades"],
      ["journal_notes", "Users can manage own notes"],
      ["journal_equity_snapshots", "Users can manage own equity snapshots"],
      ["journal_imports", "Users can manage own imports"],
      ["journal_stats_cache", "Users can manage own stats cache"],
    ] as const;
    for (const [table, name] of legacy) {
      expect(rls).toContain(`('public', '${table}', '${name}')`);
      expect(rls).toContain(`DROP POLICY IF EXISTS %I ON public.%I', '${name}', t`);
    }
  });

  it("keeps journal_notes parent-trade ownership on every target policy", () => {
    expect(rls).toContain("journal_notes.user_id = auth.uid()");
    expect(rls).toContain("FROM public.journal_trades t");
    expect(rls).toContain("t.id = journal_notes.trade_id");
    expect(rls).toContain("t.user_id = auth.uid()");
    expect(rls).toMatch(/IF t = 'journal_notes'/);
    expect(rls).toMatch(
      /CREATE POLICY %I ON public\.%I FOR SELECT TO authenticated USING \(%s\)/,
    );
    expect(rls).toMatch(
      /CREATE POLICY %I ON public\.%I FOR INSERT TO authenticated WITH CHECK \(%s\)/,
    );
    expect(rls).toMatch(
      /CREATE POLICY %I ON public\.%I FOR UPDATE TO authenticated USING \(%s\) WITH CHECK \(%s\)/,
    );
    expect(rls).toMatch(
      /CREATE POLICY %I ON public\.%I FOR DELETE TO authenticated USING \(%s\)/,
    );
    expect(rls).toContain("$journal_notes_pred$");
  });

  it("keeps system-catalog SELECT predicates distinct from owner-only writes", () => {
    expect(rls).toContain("'journal_metric_definitions'");
    expect(rls).toContain("'journal_report_templates'");
    expect(rls).toContain("(user_id IS NULL OR user_id = auth.uid())");
    expect(rls).toMatch(/t = ANY \(v_catalog\)/);
    expect(rls).toContain("$journal_formula_sel$");
    expect(rls).toContain("$journal_formula_wr$");
    expect(rls).toContain("p.id = journal_metric_formula_versions.metric_definition_id");
    expect(rls).toContain("(p.user_id IS NULL OR p.user_id = auth.uid())");
    expect(rls).toMatch(/select_pred/);
    expect(rls).toMatch(/write_pred/);
  });

  it("replaces every managed table inside one atomic DO block", () => {
    expect((rls.match(/DO \$journal_rls\$/g) ?? []).length).toBe(1);
    expect(rls).toMatch(/FOREACH t IN ARRAY v_tables LOOP/);
    for (const table of TABLE_NAMES) {
      expect(rls).toContain(`'${table}'`);
    }
    expect(rls).toMatch(
      /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.%I TO authenticated/,
    );
    expect(rls).toContain("journal_event_outbox_service_role_all");
    expect(rls).toContain("journal_audit_log_service_role_all");
    expect(rls).toContain("journal_dead_letters_service_role_all");
  });

  it("does not grant Journal tables to anon", () => {
    expect(rls).not.toMatch(/GRANT[\s\S]{0,80}ON TABLE public\.journal_[\s\S]{0,40}TO anon/i);
    expect(rls).toMatch(/REVOKE ALL ON TABLE public\.%I FROM anon/);
    expect(rls).toMatch(/REVOKE ALL ON TABLE public\.%I FROM PUBLIC/);
  });

  it("replaces the four journal-private storage policies as one atomic group", () => {
    expect(rls).toMatch(/CREATE POLICY "journal_private_select_own"/);
    expect(rls).toMatch(/CREATE POLICY "journal_private_insert_own"/);
    expect(rls).toMatch(/CREATE POLICY "journal_private_update_own"/);
    expect(rls).toMatch(/CREATE POLICY "journal_private_delete_own"/);
    expect(rls).toMatch(/WITH CHECK \(/);
  });

  it("does not write storage.buckets or auto-invoke backfill", () => {
    expect(allSql).not.toMatch(/INSERT\s+INTO\s+storage\.buckets/i);
    expect(fnSql).not.toMatch(/PERFORM\s+public\.journal_backfill_accounts_and_executions/i);
    expect(fnSql).not.toMatch(/PERFORM\s+public\.journal_migrate_legacy_trades/i);
    expect(fnSql).toMatch(/pg_temp checkpoint tables/);
    expect(fnSql).toMatch(/Do not create public\.journal_rollback_\*/);
  });

  it("does not create public rollback checkpoint tables in production migrations", () => {
    expect(allSql).not.toMatch(/CREATE TABLE[\s\S]{0,120}public\.journal_rollback_/i);
    const dir = resolve(ROOT, "supabase/migrations");
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".sql"))) {
      const text = readFileSync(resolve(dir, file), "utf8");
      expect(text, file).not.toMatch(/CREATE\s+TABLE[\s\S]{0,160}public\.journal_rollback_/i);
    }
  });

  it("keeps live-table legacy names inside the atomic policy migration", () => {
    for (const table of LIVE_TABLES) {
      expect(rls).toContain(`'${table}'`);
    }
    expect(rls).toContain("Users can manage own trades");
    expect(rls).toContain("Users can manage own notes");
  });

  it("scopes storage replacement to the four journal-private policy names", () => {
    expect(rls).toContain("'journal_private_select_own'");
    expect(rls).toContain("'journal_private_insert_own'");
    expect(rls).toContain("'journal_private_update_own'");
    expect(rls).toContain("'journal_private_delete_own'");
    expect(rls).not.toMatch(/tablename LIKE/);
    expect(rls).not.toMatch(/EXECUTE format\('ALTER TABLE storage/);
  });
});
