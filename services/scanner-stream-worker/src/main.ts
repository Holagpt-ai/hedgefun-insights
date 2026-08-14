import { EnvValidationError, loadEnv } from "./env.ts";
import { createHealthStore, healthResponse } from "./health.ts";
import { log } from "./log.ts";
import { createDailyCache, runBaselineJob } from "./baseline/builder.ts";
import {
  createCalendarExceptionLoader,
  createSupabaseRpc,
  createSupabaseStateLoader,
} from "./baseline/persist.ts";
import { startRadarV22 } from "./radar/run.ts";

const POLL_INTERVAL_MS = 60_000;

function listenSignal(sig: Deno.Signal, handler: () => void): void {
  try {
    Deno.addSignalListener(sig, handler);
  } catch {
    // Unsupported on this OS (e.g. SIGTERM on Windows).
  }
}

function interruptibleSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

function errorCodeOf(error: unknown): string {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }
  return "internal_error";
}

async function main(): Promise<void> {
  let env;
  try {
    env = loadEnv();
  } catch (error) {
    const code = error instanceof EnvValidationError
      ? error.code
      : "invalid_env";
    log("error", "startup_failed", { code });
    Deno.exit(1);
  }

  const startedAtMs = Date.now();
  const health = createHealthStore(startedAtMs);
  health.markInitializing();
  const abort = new AbortController();
  let running = true;

  const server = Deno.serve({
    port: env.port,
    hostname: "0.0.0.0",
    onListen: ({ port }) => {
      log("info", "listening", { port, massive_ws_mode: env.massiveWsMode });
    },
  }, (req) => {
    const url = new URL(req.url);
    if (url.pathname === "/health") {
      if (req.method !== "GET") {
        return new Response("Method Not Allowed", { status: 405 });
      }
      return healthResponse(health.get(Date.now()));
    }
    return new Response("Not Found", { status: 404 });
  });

  let radar: { stop: () => Promise<void> } | null = null;

  const shutdown = async () => {
    if (!running) return;
    running = false;
    abort.abort();
    log("info", "shutdown");
    if (radar) {
      try {
        await radar.stop();
      } catch {
        // lease release is best-effort
      }
    }
    try {
      await server.shutdown();
    } catch {
      // already closing
    }
    Deno.exit(0);
  };
  listenSignal("SIGTERM", () => {
    void shutdown();
  });
  listenSignal("SIGINT", () => {
    void shutdown();
  });

  const cache = createDailyCache();
  const rpc = createSupabaseRpc({
    supabaseUrl: env.supabaseUrl,
    serviceRoleKey: env.supabaseServiceRoleKey,
    fetch,
  });
  const loadState = createSupabaseStateLoader({
    supabaseUrl: env.supabaseUrl,
    serviceRoleKey: env.supabaseServiceRoleKey,
    fetch,
  });
  const loadExceptions = createCalendarExceptionLoader({
    supabaseUrl: env.supabaseUrl,
    serviceRoleKey: env.supabaseServiceRoleKey,
    fetch,
  });

  let lastSuccessfulPeriodEnd: string | null = null;
  try {
    const existing = await loadState();
    if (existing?.current_generation_id) {
      lastSuccessfulPeriodEnd = existing.period_end;
      health.applyState({
        baselineStatus: existing.status === "empty" ? "empty" : "available",
        generationId: existing.current_generation_id,
        periodStart: existing.period_start,
        periodEnd: existing.period_end,
        symbolCount: existing.symbol_count,
        workerStatus: "initializing",
      });
    }
  } catch {
    log("warn", "state_load_failed", { code: "internal_error" });
  }

  const loop = async () => {
    while (running && !abort.signal.aborted) {
      try {
        const result = await runBaselineJob({
          nowMs: () => Date.now(),
          fetch,
          polygonApiKey: env.polygonApiKey,
          rpc,
          loadState,
          loadExceptions,
          minSessions: env.baselineMinSessions,
          lookbackCalendarDays: env.baselineLookbackCalendarDays,
          cache,
          lastSuccessfulPeriodEnd,
          signal: abort.signal,
        });
        lastSuccessfulPeriodEnd = result.lastSuccessfulPeriodEnd;
        const hasGeneration = result.state.current_generation_id != null;
        if (result.errorCode) {
          health.markError(result.errorCode, hasGeneration);
          if (hasGeneration) {
            health.applyState({
              baselineStatus: result.state.status === "empty"
                ? "empty"
                : "available",
              generationId: result.state.current_generation_id,
              periodStart: result.state.period_start,
              periodEnd: result.state.period_end,
              symbolCount: result.state.symbol_count,
              errorCode: result.errorCode,
              workerStatus: "degraded",
            });
          }
          log("error", "job_failed", { code: result.errorCode });
        } else {
          health.applyState({
            baselineStatus: result.state.status === "empty"
              ? "empty"
              : "available",
            generationId: result.state.current_generation_id,
            periodStart: result.state.period_start,
            periodEnd: result.state.period_end,
            symbolCount: result.state.symbol_count,
            workerStatus: "running",
          });
          if (result.didRebuild) {
            log("info", "baseline_published", {
              symbol_count: result.state.symbol_count,
              period_end: result.state.period_end,
            });
          }
        }
      } catch (error) {
        health.markError(errorCodeOf(error), lastSuccessfulPeriodEnd != null);
        log("error", "job_failed", { code: errorCodeOf(error) });
      }
      if (!running || abort.signal.aborted) break;
      await interruptibleSleep(POLL_INTERVAL_MS, abort.signal);
    }
  };

  radar = startRadarV22({
    env,
    fetch,
    loadExceptions,
    health,
    signal: abort.signal,
  });

  void loop();
}

if (import.meta.main) {
  await main();
}
