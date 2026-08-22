import { readdirSync, readFileSync } from "node:fs";
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
  readJournalSql,
  SIZE_LIMIT,
} from "./journal-sql";

const MAP = loadProductionMigrationMap();
const ORIGINAL_RUNNER_DIGESTS = Object.fromEntries(
  MAP.segments
    .filter((segment) => segment.kind !== "function-acl")
    .map((segment) => [segment.productionFile, segment.digest]),
);
const FIRST = MAP.segments[0].productionFile;
const POLICY = MAP.segments.find((segment) => segment.kind === "policy")!.productionFile;
const LEGACY_ACL = MAP.segments.find((segment) => segment.kind === "legacy-acl")!.productionFile;
const METRIC = MAP.segments.find((segment) => segment.kind === "metric-seed")!.productionFile;
const IMPORT_FINALIZE = MAP.segments.find(
  (segment) => segment.formerFile === "20260816191390_journal_fn_import_finalize.sql",
)!.productionFile;
const FN_ACL = MAP.segments.find((segment) => segment.kind === "function-acl")!.productionFile;

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
    const prior = names.filter((name) => name < FIRST);
    expect(prior.at(-1)).toBe("20260814180000_screener_52w_baseline_job.sql");
    expect(files[0]).toBe(FIRST);
    expect(files.every((name) => name > "20260814180000_screener_52w_baseline_job.sql")).toBe(true);
    expect(new Set(files).size).toBe(files.length);
    expect(files).toHaveLength(26);
  });

  it("keeps every production Journal migration within the runner size limit", () => {
    const oversized: string[] = [];
    for (const name of files) {
      const bytes = Buffer.byteLength(
        normalizeJournalSql(readFileSync(resolve(MIGRATIONS_DIR, name), "utf8")),
        "utf8",
      );
      if (bytes > SIZE_LIMIT) oversized.push(`${name}=${bytes}`);
    }
    expect(oversized).toEqual([]);
  });

  it("recalculates every embedded integrity digest independently", () => {
    for (const name of files) {
  const sql = normalizeJournalSql(readFileSync(resolve(MIGRATIONS_DIR, name), "utf8"));
      const expected = extractIntegrityDigest(sql);
      expect(expected, name).toMatch(/^[0-9a-f]{32}$/);
      const tag = name.includes("1b96bd82-d304-45f8-9570-1206832c6c76") ? "journal_man" : "journal_stmt";
      const parts = extractTaggedStrings(sql, tag);
      expect(parts.length, name).toBeGreaterThan(0);
      expect(md5Parts(parts)).toBe(expected);
      expect(sql).toContain(`v_expected text := '${expected}'`);
    }
  });

  it("fails the digest when a statement or manifest part is changed, removed, or reordered", () => {
    const sample = files[0];
    expect(sample).toBe(FIRST);
    const sql = normalizeJournalSql(readFileSync(resolve(MIGRATIONS_DIR, sample), "utf8"));
    const parts = extractTaggedStrings(sql, "journal_stmt");
    const expected = extractIntegrityDigest(sql)!;
    const changed = [...parts];
    changed[0] = `${changed[0]}x`;
    expect(md5Parts(changed)).not.toBe(expected);
    expect(md5Parts(parts.slice(1))).not.toBe(expected);
    expect(md5Parts([...parts].reverse())).not.toBe(expected);
  });

  it("places the legacy ACL hardening file after policies and before functions", () => {
    expect(files).toContain(LEGACY_ACL);
    expect(files.indexOf(POLICY)).toBeLessThan(files.indexOf(LEGACY_ACL));
    expect(files.indexOf(LEGACY_ACL)).toBeLessThan(files.indexOf(METRIC));
  });

  it("places the function ACL hardening file after import finalize", () => {
    expect(files).toContain(FN_ACL);
    expect(files.indexOf(IMPORT_FINALIZE)).toBeLessThan(files.indexOf(FN_ACL));
  });

  it("registers extra ACL files without rewriting the previous 25 runner migrations", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(MIGRATIONS_DIR, "../../scripts/journal/runner-integrity.json"), "utf8"),
    ) as { files: { file: string; digest: string }[] };
    const previous = manifest.files.filter((entry) => entry.file !== FN_ACL);
    expect(previous).toHaveLength(25);
    expect(manifest.files.map((entry) => entry.file)).toContain(FN_ACL);
    expect(previous.map((entry) => entry.file).sort()).toEqual(
      Object.keys(ORIGINAL_RUNNER_DIGESTS).sort(),
    );
    for (const entry of previous) {
      expect(entry.digest).toBe(ORIGINAL_RUNNER_DIGESTS[entry.file]);
      const sql = normalizeJournalSql(readFileSync(resolve(MIGRATIONS_DIR, entry.file), "utf8"));
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
