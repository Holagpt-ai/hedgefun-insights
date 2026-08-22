import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");
export const SIZE_LIMIT = 20_000;
export const RS = "\x1e";
const MAP_PATH = resolve(ROOT, "scripts/journal/production-migration-map.json");

export type JournalKind = "foundation" | "policy" | "functions" | "all";

export type ProductionSegment = {
  formerFile: string;
  formerVersion: string;
  productionFile: string;
  productionVersion: string;
  uuid: string;
  digest: string;
  bytes: number;
  kind: string;
  group: "foundation" | "policy" | "functions";
  gitBlob?: string;
};

export type ProductionMigrationMap = {
  count: number;
  segments: ProductionSegment[];
};

export function loadProductionMigrationMap(): ProductionMigrationMap {
  return JSON.parse(readFileSync(MAP_PATH, "utf8")) as ProductionMigrationMap;
}

export function listJournalMigrations(kind: JournalKind = "all"): string[] {
  const map = loadProductionMigrationMap();
  return map.segments
    .filter((segment) => kind === "all" || segment.group === kind)
    .map((segment) => segment.productionFile);
}

export function listForbiddenJournalDuplicates(): string[] {
  return readdirSync(MIGRATIONS_DIR).filter(
    (name) => name.startsWith("20260816191") && name.endsWith(".sql"),
  );
}

export function normalizeJournalSql(sql: string): string {
  return sql.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function readJournalSql(kind: JournalKind = "all"): string {
  return listJournalMigrations(kind)
    .map((name) => normalizeJournalSql(readFileSync(resolve(MIGRATIONS_DIR, name), "utf8")))
    .join("\n");
}

export function md5Parts(parts: string[]): string {
  return createHash("md5").update(parts.join(RS), "utf8").digest("hex");
}

export function extractIntegrityDigest(sql: string): string | null {
  const match = normalizeJournalSql(sql).match(/-- integrity-md5: ([0-9a-f]{32})/);
  return match?.[1] ?? null;
}

export function extractTaggedStrings(sql: string, tag: string): string[] {
  const normalized = normalizeJournalSql(sql);
  const open = `$${tag}$`;
  const out: string[] = [];
  let from = 0;
  while (from < normalized.length) {
    const start = normalized.indexOf(open, from);
    if (start === -1) break;
    const innerStart = start + open.length;
    const end = normalized.indexOf(open, innerStart);
    if (end === -1) {
      throw new Error(`unclosed dollar tag ${tag}`);
    }
    out.push(normalized.slice(innerStart, end));
    from = end + open.length;
  }
  return out;
}
