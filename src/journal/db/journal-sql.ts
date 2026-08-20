import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
export const MIGRATIONS_DIR = resolve(ROOT, "supabase/migrations");
export const SIZE_LIMIT = 20_000;
export const RS = "\x1e";

export type JournalKind = "foundation" | "policy" | "functions" | "all";

export function listJournalMigrations(kind: JournalKind = "all"): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^20260816191\d{3}_journal_.*\.sql$/.test(name))
    .filter((name) => {
      const version = Number(name.slice(8, 14));
      if (kind === "foundation") return version >= 191000 && version < 191200;
      if (kind === "policy") return version >= 191200 && version < 191300;
      if (kind === "functions") return version >= 191300;
      return true;
    })
    .sort();
}

export function readJournalSql(kind: JournalKind = "all"): string {
  return listJournalMigrations(kind)
    .map((name) => readFileSync(resolve(MIGRATIONS_DIR, name), "utf8"))
    .join("\n");
}

export function md5Parts(parts: string[]): string {
  return createHash("md5").update(parts.join(RS), "utf8").digest("hex");
}

export function extractIntegrityDigest(sql: string): string | null {
  const match = sql.match(/-- integrity-md5: ([0-9a-f]{32})/);
  return match?.[1] ?? null;
}

export function extractTaggedStrings(sql: string, tag: string): string[] {
  const open = `$${tag}$`;
  const out: string[] = [];
  let from = 0;
  while (from < sql.length) {
    const start = sql.indexOf(open, from);
    if (start === -1) break;
    const innerStart = start + open.length;
    const end = sql.indexOf(open, innerStart);
    if (end === -1) {
      throw new Error(`unclosed dollar tag ${tag}`);
    }
    out.push(sql.slice(innerStart, end));
    from = end + open.length;
  }
  return out;
}
