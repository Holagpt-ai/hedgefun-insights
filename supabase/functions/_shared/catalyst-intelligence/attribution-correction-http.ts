import { timingSafeMatch } from "../timing-safe.ts";
import type { CatalystIntelStore } from "./persistence.ts";
import type { CompanyRecord } from "./types.ts";
import { runAttributionCorrection, type AttributionCorrectionScope } from "./attribution-correction.ts";

export type EnvReader = (key: string) => string | undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface AttributionCorrectionHandlerDeps {
  env: EnvReader;
  store?: CatalystIntelStore;
  openStore?: () => Promise<CatalystIntelStore>;
  loadCompanies?: () => Promise<readonly CompanyRecord[]>;
  now?: () => Date;
}

export async function handleAttributionCorrectionRequest(
  req: Request,
  deps: AttributionCorrectionHandlerDeps,
): Promise<Response> {
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

  const scope = parseScope(body);
  if (!scope) return json(400, { error: "VALIDATION_ERROR" });

  const apply = body.apply === true;
  const dryRun = body.dry_run === true;
  if (apply === dryRun) {
    return json(400, { error: "VALIDATION_ERROR", message: "set exactly one of dry_run or apply" });
  }

  const concurrencyToken = typeof body.concurrency_token === "string" ? body.concurrency_token : null;

  let store = deps.store ?? null;
  if (!store) {
    if (!deps.openStore) return json(500, { error: "VALIDATION_ERROR" });
    try {
      store = await deps.openStore();
    } catch {
      return json(500, { error: "DATABASE_ERROR" });
    }
  }

  const result = await runAttributionCorrection(store, {
    scope,
    dryRun,
    apply,
    concurrencyToken,
    loadCompanies: deps.loadCompanies,
    now: deps.now?.(),
  });

  return json(200, { ok: true, attribution_correction: result });
}

function parseScope(body: Record<string, unknown>): AttributionCorrectionScope | null {
  const rawItemId = typeof body.raw_item_id === "string" ? body.raw_item_id.trim() : "";
  const eventId = typeof body.event_id === "string" ? body.event_id.trim() : "";
  const wrongTicker = typeof body.wrong_ticker === "string" ? body.wrong_ticker.trim() : "";
  if (!rawItemId || !eventId || !wrongTicker) return null;
  return { rawItemId, eventId, wrongTicker };
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
