// process-catalyst-intelligence handler.
// Default mode dry_run. Write requires Bearer SYNC_SECRET and
// CATALYST_INTELLIGENCE_WRITE_ENABLED=true. Never mutates catalyst_events.

import { timingSafeMatch } from "../_shared/timing-safe.ts";
import {
  isIntelligenceWriteEnabled,
  parseProcessorRequestBody,
} from "../_shared/catalyst-intelligence/activation.ts";
import { readCatalystFlags } from "../_shared/catalyst-intelligence/flags.ts";
import {
  executeProcessor,
  type ProcessorStore,
} from "../_shared/catalyst-intelligence/processor.ts";
import { RULES_VERSION } from "../_shared/catalyst-intelligence/types.ts";
import { executeProviderAdapter } from "../_shared/catalyst-intelligence/adapters.ts";

export type ReasonCode =
  | "AUTH_FAILED"
  | "METHOD_NOT_ALLOWED"
  | "VALIDATION_ERROR"
  | "INTELLIGENCE_WRITES_DISABLED"
  | "DATABASE_ERROR"
  | "UNKNOWN";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

export function respondJson(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

export function respondError(status: number, code: ReasonCode): Response {
  return respondJson(status, { error: code });
}

export type EnvReader = (key: string) => string | undefined;

export type HandlerDeps = {
  env: EnvReader;
  store: ProcessorStore;
  nowMs?: () => number;
};

function log(code: ReasonCode | "OK", extra?: string): void {
  console.log(extra ? `[process-catalyst-intelligence] ${code} ${extra}` : `[process-catalyst-intelligence] ${code}`);
}

export async function handleProcessCatalystIntelligence(
  req: Request,
  deps: HandlerDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    log("METHOD_NOT_ALLOWED");
    return respondError(405, "METHOD_NOT_ALLOWED");
  }

  const syncSecret = deps.env("SYNC_SECRET") ?? "";
  const auth = req.headers.get("Authorization") ?? "";
  if (!syncSecret) {
    log("AUTH_FAILED");
    return respondError(500, "AUTH_FAILED");
  }
  const authorized = await timingSafeMatch(auth, `Bearer ${syncSecret}`);
  if (!authorized) {
    log("AUTH_FAILED");
    return respondError(403, "AUTH_FAILED");
  }

  const adapterGuard = executeProviderAdapter("polygon");
  if (adapterGuard.executed) {
    log("UNKNOWN");
    return respondError(500, "UNKNOWN");
  }

  const bodyText = await req.text();
  const parsed = parseProcessorRequestBody(bodyText);
  if (!parsed.ok) {
    log("VALIDATION_ERROR");
    return respondError(400, "VALIDATION_ERROR");
  }

  const flags = readCatalystFlags(deps.env);
  if (parsed.request.mode === "write" && !isIntelligenceWriteEnabled(deps.env("CATALYST_INTELLIGENCE_WRITE_ENABLED"))) {
    log("INTELLIGENCE_WRITES_DISABLED");
    return respondError(409, "INTELLIGENCE_WRITES_DISABLED");
  }

  const supabaseUrl = deps.env("SUPABASE_URL") ?? "";
  const serviceRole = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRole) {
    log("VALIDATION_ERROR");
    return respondError(500, "VALIDATION_ERROR");
  }

  const nowMs = deps.nowMs ?? (() => Date.now());
  const executed = await executeProcessor({
    mode: parsed.request.mode,
    flags,
    selection: parsed.request.selection,
    nowMs: nowMs(),
    store: deps.store,
  });
  if (!executed.ok) {
    log("DATABASE_ERROR");
    return respondError(500, "DATABASE_ERROR");
  }

  log("OK", `mode=${parsed.request.mode} scanned=${executed.result.telemetry.events_scanned}`);
  return respondJson(200, {
    ok: true,
    rules_version: RULES_VERSION,
    telemetry: executed.result.telemetry,
  });
}
