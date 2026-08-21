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

const ORIGINAL_RUNNER_DIGESTS: Record<string, string> = {
  "20260816191000_journal_foundation_guard.sql": "707bf9d90ba303bd7796d4dfd971211d",
  "20260816191010_journal_foundation_live_tables.sql": "775a8f4a69b4f682c8b55610e745dbd2",
  "20260816191020_journal_foundation_trades_extend.sql": "475f6a50374c70d329b42870b907be07",
  "20260816191030_journal_foundation_identity.sql": "f0c7443be0788cc718ecfd9279f53f63",
  "20260816191040_journal_foundation_cash.sql": "d6d99b0eed3db5bbfebd0f1212f958ec",
  "20260816191050_journal_foundation_trade_graph.sql": "5f2379de330346a2d3812158e4874441",
  "20260816191060_journal_foundation_notebooks.sql": "bf513961af8b243abf9a4c0ad81ab6a8",
  "20260816191070_journal_foundation_metrics.sql": "50e8a521a5a850c4e8a58f3912542f06",
  "20260816191080_journal_foundation_market.sql": "17112fdcb8f91038f70380e0b831e368",
  "20260816191090_journal_foundation_ai.sql": "c3360a689f0e24c11cd0edb3e0c07a06",
  "20260816191100_journal_foundation_imports.sql": "8b9db56e53e25dfd5c883f8be6a5d6c8",
  "20260816191110_journal_foundation_events.sql": "a1be66650cc96a95d66d7fda270953e4",
  "20260816191120_journal_foundation_finalize.sql": "c15c3b36bfff34ccb4c6ac846770d4ef",
  "20260816191200_journal_rls_storage.sql": "a8f1117770972910b0edd77b8afe300e",
  "20260816191300_journal_metric_seed.sql": "c0bb6cfea2967fb1be532cfb09be01b7",
  "20260816191310_journal_fn_calculate_trade.sql": "a22c1160044dd175df43bc035e5ddace",
  "20260816191320_journal_fn_refresh_derived.sql": "85d8c6da7a98de5d87d854a08778c27a",
  "20260816191330_journal_fn_backfill_accounts.sql": "437c50fe6a1da57d2707f9a37c67ffea",
  "20260816191340_journal_fn_migrate_legacy.sql": "f05ae4a1c619f1899d6b151a1d951c23",
  "20260816191350_journal_fn_import_rollback.sql": "469bb81b664d7cb96cf9e152bff725db",
  "20260816191360_journal_fn_save_trade.sql": "6970651aa8191fd64ce8d44eb6cdb4cd",
  "20260816191370_journal_fn_import_start.sql": "3035ed18af16105a33865e5077a9d3b2",
  "20260816191380_journal_fn_import_row.sql": "d5a0336ec8831622f0259b024f8952b9",
  "20260816191390_journal_fn_import_finalize.sql": "86569d4bee60796943deb294d56d5c99",
};

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

  it("places the legacy ACL hardening file after policies and before functions", () => {
    expect(files).toContain("20260816191210_journal_legacy_acl_hardening.sql");
    expect(files.indexOf("20260816191200_journal_rls_storage.sql")).toBeLessThan(
      files.indexOf("20260816191210_journal_legacy_acl_hardening.sql"),
    );
    expect(files.indexOf("20260816191210_journal_legacy_acl_hardening.sql")).toBeLessThan(
      files.indexOf("20260816191300_journal_metric_seed.sql"),
    );
  });

  it("registers the new ACL file without rewriting the original 24 runner migrations", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(MIGRATIONS_DIR, "../../scripts/journal/runner-integrity.json"), "utf8"),
    ) as { files: { file: string; digest: string }[] };
    const original = manifest.files.filter(
      (entry) => entry.file !== "20260816191210_journal_legacy_acl_hardening.sql",
    );
    expect(original).toHaveLength(24);
    expect(manifest.files.map((entry) => entry.file)).toContain(
      "20260816191210_journal_legacy_acl_hardening.sql",
    );
    expect(original.map((entry) => entry.file).sort()).toEqual(
      Object.keys(ORIGINAL_RUNNER_DIGESTS).sort(),
    );
    for (const entry of original) {
      expect(entry.digest).toBe(ORIGINAL_RUNNER_DIGESTS[entry.file]);
      const sql = readFileSync(resolve(MIGRATIONS_DIR, entry.file), "utf8");
      expect(extractIntegrityDigest(sql)).toBe(entry.digest);
    }
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
