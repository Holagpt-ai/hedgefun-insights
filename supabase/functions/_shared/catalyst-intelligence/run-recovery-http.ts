import { timingSafeMatch } from "../timing-safe.ts";
import type { CatalystIntelStore } from "./persistence.ts";
import { runStaleRunRecovery } from "./run-recovery.ts";

export type EnvReader = (key: string) => string | undefined;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export interface RunRecoveryHandlerDeps {
  env: EnvReader;
  store?: CatalystIntelStore;
  openStore?: () => Promise<CatalystIntelStore>;
  now?: () => Date;
}

export async function handleRunRecoveryRequest(req: Request, deps: RunRecoveryHandlerDeps): Promise<Response> {
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
  const runId = typeof body.run_id === "string" ? body.run_id.trim() : "";
  if (!runId) return json(400, { error: "VALIDATION_ERROR" });
  const apply = body.apply === true;
  const dryRun = body.dry_run === true;
  if (apply === dryRun) return json(400, { error: "VALIDATION_ERROR" });
  let store = deps.store ?? null;
  if (!store) {
    if (!deps.openStore) return json(500, { error: "VALIDATION_ERROR" });
    try {
      store = await deps.openStore();
    } catch {
      return json(500, { error: "DATABASE_ERROR" });
    }
  }
  const result = await runStaleRunRecovery(store, {
    runId,
    dryRun,
    apply,
    concurrencyToken: typeof body.concurrency_token === "string" ? body.concurrency_token : null,
    now: deps.now?.(),
  });
  return json(200, { ok: result.status === "OK", run_recovery: result });
}

function json(status: number, payload: Record<string, unknown>): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
