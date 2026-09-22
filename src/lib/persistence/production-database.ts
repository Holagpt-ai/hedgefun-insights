import { readFileSync } from "node:fs";
import postgres, { type Sql } from "postgres";

export const PRODUCTION_PROJECT_REF = "zcjptaolpumhtlwhlemq";

export function loadDotEnvFiles(): void {
  for (const file of [".env", ".env.local"]) {
    try {
      const text = readFileSync(file, "utf8");
      for (const line of text.split(/\r?\n/)) {
        if (!line || line.startsWith("#")) continue;
        const index = line.indexOf("=");
        if (index <= 0) continue;
        const key = line.slice(0, index);
        let value = line.slice(index + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      // optional files
    }
  }
}

/** Requires a direct Postgres URL for the Stocksist production project. */
export function requireProductionDatabaseUrl(): string {
  const url = (
    process.env.HISTORICAL_PRODUCTION_DATABASE_URL
    ?? process.env.LOVABLE_DB_MIGRATION_URL
    ?? process.env.SUPABASE_DB_URL
    ?? process.env.DATABASE_URL
    ?? ""
  ).trim();
  if (!url) {
    throw new Error("HISTORICAL_PRODUCTION_DATABASE_URL is required");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("production database url is invalid");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("production database url must use postgres");
  }
  if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
    throw new Error("production database url must not be localhost");
  }
  if (!url.includes(PRODUCTION_PROJECT_REF)) {
    throw new Error(`production database url must target project ${PRODUCTION_PROJECT_REF}`);
  }
  return url;
}

export function openProductionSql(url: string): Sql {
  return postgres(url, { max: 4, prepare: false, connect_timeout: 30, idle_timeout: 20 });
}
