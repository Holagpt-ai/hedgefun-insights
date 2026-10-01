import { timingSafeMatch } from "../timing-safe.ts";
import type { CatalystIntelStore } from "./persistence.ts";
import { runEventReconciliation, type ReconciliationScope } from "./reconciliation.ts";

export type EnvReader = (key: string) => string | undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface ReconcileHandlerDeps {
  env: EnvReader;
  store?: CatalystIntelStore;
  openStore?: () => Promise<CatalystIntelStore>;
  now?: () => Date;
}

export async function handleReconciliationRequest(req: Request, deps: ReconcileHandlerDeps): Promise<Response> {
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

  const concurrencyTokens = parseTokens(body.concurrency_tokens);

  let store = deps.store ?? null;
  if (!store) {
    if (!deps.openStore) return json(500, { error: "VALIDATION_ERROR" });
    try {
      store = await deps.openStore();
    } catch {
      return json(500, { error: "DATABASE_ERROR" });
    }
  }

  const result = await runEventReconciliation(store, {
    scope,
    dryRun,
    apply,
    concurrencyTokens,
    now: deps.now?.(),
  });

  return json(200, { ok: true, reconciliation: result });
}

function parseScope(body: Record<string, unknown>): ReconciliationScope | null {
  const ticker = typeof body.ticker === "string" ? body.ticker.trim() : "";
  const sourceKey = typeof body.source_key === "string" ? body.source_key.trim() : "";
  const expectedCount = typeof body.expected_count === "number"
    ? body.expected_count
    : typeof body.expected_count === "string"
    ? Number(body.expected_count)
    : NaN;
  if (!ticker || !sourceKey || !Number.isFinite(expectedCount) || expectedCount < 1) return null;
  return { ticker, sourceKey, expectedCount: Math.floor(expectedCount) };
}

function parseTokens(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, token] of Object.entries(value as Record<string, unknown>)) {
    if (typeof token === "string" && token.length > 0) out[key] = token;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
