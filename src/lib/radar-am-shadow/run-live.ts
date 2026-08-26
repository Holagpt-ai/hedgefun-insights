/**
 * Read-only AM vs Radar V2.2 shadow comparator.
 * Usage: npm run radar:am-shadow
 * Does not change production UI. Prints a deterministic report to stdout.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  compareAmRadarShadow,
  createAnonClient,
  formatAmRadarShadowReport,
  loadAmRadarShadowFeeds,
  viewFromLoadedFeeds,
} from "./index";

function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!existsSync(path)) return out;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function env(name: string, file: Record<string, string>): string | undefined {
  return process.env[name] || file[name];
}

async function main() {
  const file = {
    ...readEnvFile(resolve(process.cwd(), ".env")),
    ...readEnvFile(resolve(process.cwd(), ".env.local")),
  };
  const url = env("VITE_SUPABASE_URL", file) || env("SUPABASE_URL", file);
  const key =
    env("VITE_SUPABASE_PUBLISHABLE_KEY", file) ||
    env("SUPABASE_PUBLISHABLE_KEY", file) ||
    env("VITE_SUPABASE_ANON_KEY", file);
  if (!url || !key) {
    console.error("AM RADAR SHADOW — missing VITE_SUPABASE_URL / publishable key");
    process.exit(2);
  }

  const nowMs = Date.now();
  const client = createAnonClient(url, key);
  const feeds = await loadAmRadarShadowFeeds(client);
  if (feeds.screenerError) {
    console.error(`screener_query_error=${feeds.screenerError}`);
  }
  if (feeds.v22Error) {
    console.error(`v22_query_error=${feeds.v22Error}`);
  }
  const comparison = compareAmRadarShadow({
    nowMs,
    screenerRows: feeds.screenerRows,
    v22View: viewFromLoadedFeeds(feeds, nowMs),
    v22RawState: feeds.v22RawState,
    v22RawRows: feeds.v22RawRows,
  });
  process.stdout.write(`${formatAmRadarShadowReport(comparison)}\n`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "shadow_run_failed");
  process.exit(1);
});
