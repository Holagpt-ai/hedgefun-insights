import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractIntegrityDigest,
  listForbiddenJournalDuplicates,
  listJournalMigrations,
  loadProductionMigrationMap,
  MIGRATIONS_DIR,
  normalizeJournalSql,
} from "./journal-sql";

describe("Journal production migration collision guard", () => {
  const map = loadProductionMigrationMap();
  const files = listJournalMigrations();

  it("maps exactly 26 logical segments onto unique production files", () => {
    expect(map.count).toBe(26);
    expect(map.segments).toHaveLength(26);
    expect(files).toHaveLength(26);
    expect(new Set(map.segments.map((segment) => segment.formerFile)).size).toBe(26);
    expect(new Set(map.segments.map((segment) => segment.productionFile)).size).toBe(26);
    expect(new Set(map.segments.map((segment) => segment.formerVersion)).size).toBe(26);
    expect(new Set(map.segments.map((segment) => segment.productionVersion)).size).toBe(26);
    expect(files).toEqual(map.segments.map((segment) => segment.productionFile));
  });

  it("contains zero executable 20260816191* Journal migrations", () => {
    expect(listForbiddenJournalDuplicates()).toEqual([]);
    const onDisk = readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql"));
    expect(onDisk.filter((name) => name.startsWith("20260816191"))).toEqual([]);
    for (const segment of map.segments) {
      expect(onDisk).not.toContain(segment.formerFile);
      expect(onDisk).toContain(segment.productionFile);
    }
  });

  it("keeps canonical files byte, UUID, and digest identical to the production map", () => {
    for (const segment of map.segments) {
      const sql = normalizeJournalSql(
        readFileSync(resolve(MIGRATIONS_DIR, segment.productionFile), "utf8"),
      );
      expect(Buffer.byteLength(sql, "utf8"), segment.productionFile).toBe(segment.bytes);
      expect(segment.productionFile).toBe(`${segment.productionVersion}_${segment.uuid}.sql`);
      expect(extractIntegrityDigest(sql)).toBe(segment.digest);
    }
  });
});
