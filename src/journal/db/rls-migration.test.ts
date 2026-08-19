import { readdirSync, readFileSync } from "node:fs";
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

const LIVE_TABLES = [
  "journal_trades",
  "journal_notes",
  "journal_equity_snapshots",
  "journal_stats_cache",
  "journal_imports",
];

function hasEnableRls(sql: string, table: string): boolean {
  return (
    sql.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`) ||
    sql.includes(`EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', '${table}')`)
  );
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

describe("journal foundation fail-closed Migration 1", () => {
  const schema = readFileSync(
    resolve(ROOT, "supabase/migrations/20260816190000_journal_foundation_schema.sql"),
    "utf8",
  );
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
    const live = LIVE_TABLES;
    for (const table of live) {
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
    expect(schema).toMatch(
      /EXECUTE FUNCTION public\.set_updated_at\(\)/,
    );
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
  const rls = readFileSync(
    resolve(ROOT, "supabase/migrations/20260816190100_journal_rls_storage.sql"),
    "utf8",
  );
  const fnSql = readFileSync(
    resolve(ROOT, "supabase/migrations/20260816190200_journal_functions_backfill.sql"),
    "utf8",
  );
  const allSql = loadSql();
  const live = LIVE_TABLES;

  it("does not globally drop journal_% policies", () => {
    expect(rls).not.toMatch(/tablename LIKE 'journal_%'/);
    expect(rls).not.toMatch(/DROP POLICY IF EXISTS %I ON %I\.%I/);
    expect(rls).not.toMatch(/^DROP POLICY /m);
    expect(rls).not.toMatch(/^CREATE POLICY /m);
  });

  it("preflights unexpected policies before any DROP POLICY", () => {
    const pre = rls.indexOf("DO $journal_pre$");
    const firstDrop = rls.indexOf("DROP POLICY IF EXISTS");
    expect(pre).toBeGreaterThan(-1);
    expect(firstDrop).toBeGreaterThan(pre);
    expect(rls).toMatch(/preflight: unexpected policy/);
    const preBody = rls.slice(pre, rls.indexOf("$journal_pre$;"));
    expect(preBody).toMatch(/WHERE p\.schemaname = 'public'/);
    expect(preBody).not.toMatch(/storage/);
    const legacy = [
      ["journal_trades", "Users can manage own trades"],
      ["journal_notes", "Users can manage own notes"],
      ["journal_equity_snapshots", "Users can manage own equity snapshots"],
      ["journal_imports", "Users can manage own imports"],
      ["journal_stats_cache", "Users can manage own stats cache"],
    ] as const;
    for (const [table, name] of legacy) {
      expect(preBody).toContain(`('public', '${table}', '${name}')`);
      const header = `-- public.${table}`;
      const start = rls.indexOf(header);
      const doStart = rls.indexOf("DO $journal_pol$", start);
      const doEnd = rls.indexOf("$journal_pol$;", doStart + 10);
      const block = rls.slice(doStart, doEnd);
      expect(block).toContain(
        `DROP POLICY IF EXISTS %I ON public.%I', '${name}', '${table}'`,
      );
      expect(
        (rls.match(
          new RegExp(
            `DROP POLICY IF EXISTS %I ON public\\.%I', '${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}', '${table}'`,
            "g",
          ),
        ) ?? []).length,
      ).toBe(1);
    }
  });

  it("keeps journal_notes parent-trade ownership on every target policy", () => {
    const start = rls.indexOf("-- public.journal_notes");
    const doStart = rls.indexOf("DO $journal_pol$", start);
    const doEnd = rls.indexOf("$journal_pol$;", doStart + 10);
    const block = rls.slice(doStart, doEnd);
    const ownership = [
      "journal_notes.user_id = auth.uid()",
      "EXISTS (",
      "FROM public.journal_trades t",
      "t.id = journal_notes.trade_id",
      "t.user_id = auth.uid()",
    ];
    for (const name of [
      "journal_notes_select_own",
      "journal_notes_insert_own",
      "journal_notes_update_own",
      "journal_notes_delete_own",
    ]) {
      const create = block.indexOf(`CREATE POLICY "${name}"`);
      const next = block.indexOf("CREATE POLICY", create + 10);
      const policy = block.slice(create, next === -1 ? block.length : next);
      for (const needle of ownership) {
        expect(policy, name).toContain(needle);
      }
      expect(policy).not.toMatch(/USING \(user_id = auth\.uid\(\)\)/);
      expect(policy).not.toMatch(/WITH CHECK \(user_id = auth\.uid\(\)\)/);
    }
    const update = block.slice(
      block.indexOf('CREATE POLICY "journal_notes_update_own"'),
      block.indexOf('CREATE POLICY "journal_notes_delete_own"'),
    );
    expect(update).toMatch(/USING \([\s\S]*EXISTS \([\s\S]*t\.id = journal_notes\.trade_id/);
    expect(update).toMatch(/WITH CHECK \([\s\S]*EXISTS \([\s\S]*t\.id = journal_notes\.trade_id/);
  });

  it("replaces each table's policies inside one atomic DO block", () => {
    expect((rls.match(/DO \$journal_pol\$/g) ?? []).length).toBe(TABLE_NAMES.length + 1);
    for (const table of TABLE_NAMES) {
      const header = `-- public.${table}`;
      const start = rls.indexOf(header);
      expect(start).toBeGreaterThan(-1);
      const doStart = rls.indexOf("DO $journal_pol$", start);
      const doEnd = rls.indexOf("$journal_pol$;", doStart + 10);
      expect(doEnd).toBeGreaterThan(doStart);
      const block = rls.slice(doStart, doEnd);
      expect(block).toMatch(new RegExp(`CREATE POLICY "${table}_select_own"`));
      expect(block).toContain(
        `DROP POLICY IF EXISTS %I ON public.%I', '${table}_select_own', '${table}'`,
      );
      const after = rls.slice(doEnd);
      const grantIdx = after.indexOf(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${table} TO authenticated;`,
      );
      const nextDo = after.indexOf("DO $journal_pol$");
      expect(grantIdx).toBeGreaterThan(-1);
      if (nextDo !== -1) expect(grantIdx).toBeLessThan(nextDo);
    }
  });

  it("does not grant Journal tables to anon", () => {
    expect(rls).not.toMatch(/GRANT[\s\S]{0,80}ON TABLE public\.journal_[\s\S]{0,40}TO anon/i);
    expect((rls.match(/REVOKE ALL ON TABLE public\.journal_[a-z0-9_]+ FROM anon;/g) ?? []).length).toBe(
      TABLE_NAMES.length,
    );
  });

  it("replaces the four journal-private storage policies as one atomic group", () => {
    const start = rls.indexOf("-- storage.objects");
    const doStart = rls.indexOf("DO $journal_pol$", start);
    const doEnd = rls.indexOf("$journal_pol$;", doStart + 10);
    const block = rls.slice(doStart, doEnd);
    expect(block).toMatch(/CREATE POLICY "journal_private_select_own"/);
    expect(block).toMatch(/CREATE POLICY "journal_private_insert_own"/);
    expect(block).toMatch(/CREATE POLICY "journal_private_update_own"/);
    expect(block).toMatch(/CREATE POLICY "journal_private_delete_own"/);
    expect(block).toMatch(/WITH CHECK \(/);
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

  it("keeps live-table policy replacement after preflight and inside atomic blocks", () => {
    for (const table of live) {
      expect(rls).toContain(`-- public.${table}`);
    }
  });

  it("scopes storage replacement to the four journal-private policy names", () => {
    const start = rls.indexOf("-- storage.objects");
    const block = rls.slice(start);
    expect(block).toContain("'journal_private_select_own'");
    expect(block).toContain("'journal_private_insert_own'");
    expect(block).toContain("'journal_private_update_own'");
    expect(block).toContain("'journal_private_delete_own'");
    expect(block).not.toMatch(/tablename LIKE/);
    expect(block).not.toMatch(/EXECUTE format\('ALTER TABLE storage/);
  });
});
