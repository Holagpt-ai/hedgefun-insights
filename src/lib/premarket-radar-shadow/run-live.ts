/**
 * Read-only Pre-Market Radar V1 shadow capture.
 * Usage:
 *   npm run radar:premarket-shadow
 *   npm run radar:premarket-shadow -- --schedule
 *
 * Operates only 04:00–09:30 ET. Does not change production AM or Radar V2.2.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { easternDate } from "@/lib/radar-v22";
import { evaluatePremarketShadow, notApplicableReport, selectBarFetchUniverse } from "./evaluate";
import { formatPremarketShadowReport } from "./format";
import {
  createAnonClient,
  loadCalendarExceptions,
  loadCatalystsForSymbols,
  loadPersistedScreener,
} from "./fetch";
import { fetchBarsForSymbols, fetchPolygonSnapshot } from "./polygon";
import { closedPremarketGate, nextSlotWaitMs, resolvePremarketGate } from "./session";
import { PREMARKET_BAR_FETCH_LIMIT } from "./types";

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

function parseArgs(argv: string[]): { schedule: boolean; out: string | null } {
  let schedule = false;
  let out: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--schedule") schedule = true;
    if (argv[i] === "--out" && argv[i + 1]) {
      out = argv[i + 1];
      i += 1;
    }
  }
  return { schedule, out };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureOnce(opts: {
  polygonKey: string | undefined;
  supabaseUrl: string | undefined;
  supabaseKey: string | undefined;
  out: string | null;
}): Promise<number> {
  const nowMs = Date.now();
  const client =
    opts.supabaseUrl && opts.supabaseKey
      ? createAnonClient(opts.supabaseUrl, opts.supabaseKey)
      : null;

  let exceptions = null;
  if (client) {
    const cal = await loadCalendarExceptions(client, easternDate(nowMs));
    exceptions = cal.exceptions;
    if (cal.error) {
      process.stderr.write(`calendar_query=${cal.error}\n`);
    }
  }

  const gate = resolvePremarketGate(nowMs, exceptions);
  const pmWindow = gate.ok ? gate.window : null;
  if (!pmWindow) {
    const closed = closedPremarketGate(gate);
    if (!closed) return 1;
    const report = notApplicableReport(closed, nowMs);
    const text = formatPremarketShadowReport(report);
    process.stdout.write(`${text}\n`);
    return 0;
  }

  if (!opts.polygonKey) {
    process.stderr.write(
      "PREMARKET SHADOW — missing POLYGON_API_KEY (required for in-window snapshot/aggs)\n",
    );
    return 2;
  }

  const tickers = await fetchPolygonSnapshot({ apiKey: opts.polygonKey });
  const universe = selectBarFetchUniverse(tickers, PREMARKET_BAR_FETCH_LIMIT);
  const { barsBySymbol, errors } = await fetchBarsForSymbols({
    apiKey: opts.polygonKey,
    symbols: universe,
    fromMs: pmWindow.windowStartMs,
    toMs: Math.min(pmWindow.captureMs, pmWindow.windowEndExclusiveMs) - 1,
  });
  for (const err of errors) {
    process.stderr.write(`aggs_error=${err}\n`);
  }

  let persisted = { rows: null as Awaited<ReturnType<typeof loadPersistedScreener>>["rows"], error: client ? null : "no_supabase_client" };
  let catalysts: Awaited<ReturnType<typeof loadCatalystsForSymbols>> = {
    events: [],
    error: null,
  };
  if (client) {
    persisted = await loadPersistedScreener(client);
    catalysts = await loadCatalystsForSymbols(client, universe, nowMs);
    if (catalysts.error) process.stderr.write(`catalyst_query=${catalysts.error}\n`);
  }

  const report = evaluatePremarketShadow({
    window: pmWindow,
    tickers,
    barsBySymbol,
    persistedScreener: persisted.rows,
    persistedScreenerError: persisted.error,
    catalysts: catalysts.events,
    nowMs,
  });
  const text = formatPremarketShadowReport(report);
  process.stdout.write(`${text}\n`);
  if (opts.out) {
    writeFileSync(resolve(opts.out), `${text}\n\n${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  return 0;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const file = {
    ...readEnvFile(resolve(process.cwd(), ".env")),
    ...readEnvFile(resolve(process.cwd(), ".env.local")),
  };
  const polygonKey = env("POLYGON_API_KEY", file);
  const supabaseUrl = env("VITE_SUPABASE_URL", file) || env("SUPABASE_URL", file);
  const supabaseKey =
    env("VITE_SUPABASE_PUBLISHABLE_KEY", file) ||
    env("SUPABASE_PUBLISHABLE_KEY", file) ||
    env("VITE_SUPABASE_ANON_KEY", file);

  if (!args.schedule) {
    process.exitCode = await captureOnce({
      polygonKey,
      supabaseUrl,
      supabaseKey,
      out: args.out,
    });
    return;
  }

  process.stderr.write("premarket-shadow schedule mode — Ctrl+C to stop\n");
  for (;;) {
    const code = await captureOnce({
      polygonKey,
      supabaseUrl,
      supabaseKey,
      out: args.out,
    });
    if (code !== 0) {
      process.exitCode = code;
      return;
    }
    const wait = nextSlotWaitMs(Date.now());
    if (wait === null) {
      process.stderr.write("schedule complete (no further pre-market slot)\n");
      process.exitCode = 0;
      return;
    }
    process.stderr.write(`sleeping ${Math.round(wait / 1000)}s until next slot\n`);
    let remaining = wait;
    while (remaining > 0) {
      const chunk = Math.min(remaining, 30_000);
      await sleep(chunk);
      remaining -= chunk;
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "shadow_run_failed");
  process.exitCode = 1;
});
