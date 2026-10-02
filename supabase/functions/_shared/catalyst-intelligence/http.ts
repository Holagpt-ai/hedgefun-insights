import { timingSafeMatch } from "../timing-safe.ts";
import { companyEventsAdapter } from "./adapters/company-events.ts";
import { companyIrAdapter } from "./adapters/company-ir.ts";
import { newsPrAdapter } from "./adapters/news-pr.ts";
import { secFilingsAdapter } from "./adapters/sec.ts";
import { aiEnrichmentEnabled } from "./ai-enrichment.ts";
import { botEnabledFlag, GENERIC_USER_AGENT, readFlag, SOURCE_GATE_NOTE } from "./config.ts";
import { DatabaseReadError } from "./conflicts.ts";
import { observationFromRadarRow } from "./market-reaction.ts";
import type { CatalystIntelStore } from "./persistence.ts";
import { parseHistoricalBackfillScope, parseReactionRunMode } from "./reaction-eligibility.ts";
import { runCollectorBot, runReactionBot } from "./run-bot.ts";
import type { EventPriceBar } from "./event-bars.ts";
import type { BotId, CompanyRecord, MarketObservation } from "./types.ts";

export type EnvReader = (key: string) => string | undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface IntelHandlerDeps {
  bot: BotId;
  env: EnvReader;
  store?: CatalystIntelStore;
  openStore?: () => Promise<CatalystIntelStore>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  loadObservation?: (symbol: string) => Promise<MarketObservation | null>;
  loadReferenceBars?: (symbol: string, eventAtIso: string) => Promise<EventPriceBar[]>;
  cikMap?: ReadonlyMap<string, string[]>;
  loadCikMap?: () => Promise<ReadonlyMap<string, string[]>>;
  sleepFn?: (ms: number) => Promise<void>;
  companies?: readonly CompanyRecord[];
  loadCompanies?: () => Promise<readonly CompanyRecord[]>;
}

export async function handleCatalystIntelRequest(req: Request, deps: IntelHandlerDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  const secret = deps.env("SYNC_SECRET") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (!secret || !(await timingSafeMatch(auth, `Bearer ${secret}`))) {
    return json(403, { error: "AUTH_FAILED" });
  }

  let body: Record<string, unknown> = {};
  const text = await req.text();
  if (text.trim()) {
    try {
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json(400, { error: "VALIDATION_ERROR" });
      body = parsed as Record<string, unknown>;
    } catch {
      return json(400, { error: "VALIDATION_ERROR" });
    }
  }
  if ("url" in body || "urls" in body) return json(400, { error: "VALIDATION_ERROR" });

  const flag = readFlag(deps.env(botEnabledFlag(deps.bot)));
  if (flag === false) {
    return json(200, { ok: true, status: "disabled", bot: deps.bot, ai_enrichment: false, activation: SOURCE_GATE_NOTE });
  }

  let store = deps.store ?? null;
  if (!store) {
    if (!deps.openStore) return json(500, { error: "VALIDATION_ERROR" });
    try {
      store = await deps.openStore();
    } catch {
      return json(500, { error: "DATABASE_ERROR" });
    }
  }
  if (!store) return json(500, { error: "VALIDATION_ERROR" });
  let config;
  try {
    config = await store.getBotConfig(deps.bot);
  } catch (err) {
    if (err instanceof DatabaseReadError) return json(500, { ok: false, error: "DATABASE_ERROR", status: "failed", bot: deps.bot });
    throw err;
  }
  const enabled = flag === true ? true : (config?.enabled ?? false);
  if (!enabled) {
    return json(200, { ok: true, status: "disabled", bot: deps.bot, ai_enrichment: false, activation: SOURCE_GATE_NOTE });
  }

  const userAgent = deps.bot === "sec"
    ? (deps.env("SEC_USER_AGENT") ?? "").trim()
    : GENERIC_USER_AGENT;
  if (deps.bot === "sec" && !userAgent) {
    return json(400, { error: "VALIDATION_ERROR", message: "SEC_USER_AGENT is required" });
  }

  const allowlist = typeof body.source_ids === "undefined"
    ? splitList(deps.env("CATALYST_INTEL_SOURCE_ALLOWLIST"))
    : stringList(body.source_ids);
  if (allowlist === null) return json(400, { error: "VALIDATION_ERROR" });
  const batchLimit = numberLimit(body.batch_limit, config?.batchLimit ?? 25);
  if (batchLimit == null) return json(400, { error: "VALIDATION_ERROR" });
  const now = deps.now?.() ?? new Date();
  const ai = aiEnrichmentEnabled(deps.env);

  if (deps.bot === "reactions") {
    const load = deps.loadObservation ?? (async () => null);
    const mode = parseReactionRunMode(body.mode);
    let historicalBackfill;
    if (mode === "historical_backfill") {
      historicalBackfill = parseHistoricalBackfillScope(body);
      if (!historicalBackfill) return json(400, { error: "VALIDATION_ERROR", message: "historical_backfill requires bounded event_ids or ticker with reference window" });
    }
    const run = await runReactionBot({
      store,
      now,
      batchLimit,
      loadObservation: load,
      loadReferenceBars: deps.loadReferenceBars,
      mode,
      historicalBackfill,
    });
    return finishRun(deps.bot, ai, run);
  }

  const adapter = adapterFor(deps.bot);
  const run = await runCollectorBot({
    bot: deps.bot,
    adapter,
    store,
    now,
    userAgent,
    fetchImpl: deps.fetchImpl,
    batchLimit,
    concurrency: config?.concurrency ?? 3,
    allowlist,
    allowFixtures: false,
    cikMap: deps.cikMap,
    sleepFn: deps.sleepFn,
    companies: deps.companies,
    loadCompanies: deps.loadCompanies,
  });
  return finishRun(deps.bot, ai, run);
}

function finishRun(bot: BotId, ai: boolean, run: Parameters<typeof publicRun>[0] & { status: string }): Response {
  if (run.status === "failed") {
    const providerDependency = run.errors.some((error) => error.category === "sec_provider_dependency_error");
    return json(providerDependency ? 502 : 500, {
      ok: false,
      error: providerDependency ? "SEC_PROVIDER_DEPENDENCY_FAILURE" : "DATABASE_ERROR",
      status: "failed",
      bot,
      ai_enrichment: ai,
      activation: SOURCE_GATE_NOTE,
      run: publicRun(run),
    });
  }
  return json(200, { ok: true, status: run.status, bot, ai_enrichment: ai, activation: SOURCE_GATE_NOTE, run: publicRun(run) });
}

export function adapterFor(bot: BotId) {
  if (bot === "sec") return secFilingsAdapter;
  if (bot === "ir") return companyIrAdapter;
  if (bot === "events") return companyEventsAdapter;
  if (bot === "news") return newsPrAdapter;
  throw new Error("reactions have no source adapter");
}

function publicRun(run: {
  status: string;
  runId: string;
  sourcesAttempted: number;
  sourcesSuccessful: number;
  sourcesFailed: number;
  rawItemsSeen: number;
  newItems: number;
  duplicates: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsInvalidated: number;
  elapsedMs: number | null;
  observability?: Record<string, unknown>;
  errors: { sourceId: string; category: string; statusCode: number | null; retryable: boolean; elapsedMs: number; details?: Record<string, unknown> }[];
}) {
  return {
    status: run.status,
    run_id: run.runId,
    sources_attempted: run.sourcesAttempted,
    sources_successful: run.sourcesSuccessful,
    sources_failed: run.sourcesFailed,
    raw_items_seen: run.rawItemsSeen,
    new_items: run.newItems,
    duplicates: run.duplicates,
    events_created: run.eventsCreated,
    events_updated: run.eventsUpdated,
    events_invalidated: run.eventsInvalidated,
    elapsed_ms: run.elapsedMs,
    observability: run.observability ?? null,
    errors: run.errors.map((error) => ({
      source_id: error.sourceId,
      category: error.category,
      status_code: error.statusCode,
      retryable: error.retryable,
      elapsed_ms: error.elapsedMs,
      ...(error.category === "sec_provider_dependency_error" ? { details: publicProviderDetails(error.details) } : {}),
    })),
  };
}

function publicProviderDetails(details: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!details) return null;
  const allow = ["stage", "provider", "url_identifier", "error_type", "message", "attempt", "attempts", "due_sources", "atom_attempted"];
  const out: Record<string, unknown> = {};
  for (const key of allow) {
    if (key in details) out[key] = details[key];
  }
  return out;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((part) => part.trim()).filter(Boolean);
}

function stringList(value: unknown): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return value as string[];
}

function numberLimit(value: unknown, fallback: number): number | null {
  if (value == null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 200) return null;
  return value;
}

export { observationFromRadarRow };
