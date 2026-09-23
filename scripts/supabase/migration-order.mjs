/**
 * Supabase migration filename ordering (lexicographic prefix = apply order).
 * New migrations MUST sort after the current max 14-digit timestamp prefix.
 */
import fs from "node:fs";
import path from "node:path";

export const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
const PREFIX_RE = /^(\d{14})_/;

export function migrationTimestampFromFilename(filename) {
  const base = path.basename(filename);
  const match = PREFIX_RE.exec(base);
  if (!match) {
    return { filename: base, timestamp: null, error: "missing 14-digit UTC prefix" };
  }
  return { filename: base, timestamp: match[1], error: null };
}

export function listSupabaseMigrations(dir = MIGRATIONS_DIR) {
  if (!fs.existsSync(dir)) {
    throw new Error(`migrations directory not found: ${dir}`);
  }
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

export function maxMigrationTimestamp(dir = MIGRATIONS_DIR) {
  let max = null;
  for (const file of listSupabaseMigrations(dir)) {
    const parsed = migrationTimestampFromFilename(file);
    if (parsed.error) continue;
    if (max === null || parsed.timestamp > max) max = parsed.timestamp;
  }
  return max;
}

/** Ensures every timestamp-prefixed file sorts in strictly increasing order. */
export function validateMigrationOrdering(dir = MIGRATIONS_DIR) {
  const files = listSupabaseMigrations(dir);
  const errors = [];
  let prev = null;
  const seen = new Map();

  for (const file of files) {
    const parsed = migrationTimestampFromFilename(file);
    if (parsed.error) {
      errors.push(`${file}: ${parsed.error}`);
      continue;
    }
    if (seen.has(parsed.timestamp)) {
      errors.push(
        `duplicate timestamp ${parsed.timestamp}: ${seen.get(parsed.timestamp)} and ${file}`,
      );
    } else {
      seen.set(parsed.timestamp, file);
    }
    if (prev !== null && parsed.timestamp <= prev) {
      errors.push(
        `non-monotonic timestamp: ${file} (${parsed.timestamp}) is not after ${prev}`,
      );
    }
    prev = parsed.timestamp;
  }

  return { ok: errors.length === 0, errors, maxTimestamp: prev, fileCount: files.length };
}

/**
 * Validate a proposed migration filename (or full path) against the current max.
 */
export function validateNewMigrationFilename(candidate, dir = MIGRATIONS_DIR) {
  const parsed = migrationTimestampFromFilename(candidate);
  if (parsed.error) {
    return { ok: false, reason: parsed.error };
  }
  const max = maxMigrationTimestamp(dir);
  if (max !== null && parsed.timestamp <= max) {
    return {
      ok: false,
      reason: `timestamp ${parsed.timestamp} must be > current max ${max} (new migrations sort behind applied history and are skipped)`,
      maxTimestamp: max,
    };
  }
  return { ok: true, maxTimestamp: max, timestamp: parsed.timestamp };
}
