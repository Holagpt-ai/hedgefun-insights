#!/usr/bin/env node
/**
 * Apply all repo migrations to a disposable Postgres (local Docker only).
 * Usage: SCREENER_SYNC_PG_TEST_URL=postgresql://postgres:test@127.0.0.1:5433/postgres node scripts/supabase/screener-sync-pg-test-setup.mjs
 *
 * Never point at Lovable production or shared databases.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const url = process.env.SCREENER_SYNC_PG_TEST_URL;
if (!url) {
  console.error("Set SCREENER_SYNC_PG_TEST_URL to a disposable database.");
  process.exit(1);
}
if (/lovable|supabase\.co|zcjptaolpumhtlwhlemq/i.test(url)) {
  console.error("Refusing to run against production-like host.");
  process.exit(1);
}

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const files = (await readdir(migrationsDir))
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log(`Applying ${files.length} migrations to disposable DB…`);

for (const file of files) {
  const path = join(migrationsDir, file);
  const sql = await readFile(path, "utf8");
  const psql = spawnSync(
    "psql",
    [url, "-v", "ON_ERROR_STOP=1", "-f", path],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (psql.status !== 0) {
    console.error(`Failed on ${file}:\n${psql.stderr || psql.stdout}`);
    process.exit(psql.status ?? 1);
  }
  process.stdout.write(".");
}

console.log("\nDone.");
