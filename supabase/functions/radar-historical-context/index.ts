import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const JSON_HEADERS = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "private, no-store",
};

const MAX_REQUESTS = 20;
const CONCURRENCY = 3;
const PER_REQUEST_TIMEOUT_MS = 2_500;
const BATCH_TIMEOUT_MS = 8_000;

function readSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return trimmed.length > 0 ? trimmed : null;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

async function resolveSecurityId(
  db: ReturnType<typeof createClient>,
  symbol: string,
): Promise<string | null> {
  const res = await db.from("securities")
    .select("security_id")
    .eq("current_symbol", symbol)
    .eq("active", true)
    .limit(2);
  if (res.error || !res.data || res.data.length !== 1) return null;
  return String(res.data[0]?.security_id ?? "");
}

async function loadContextViaBridge(input: {
  bridgeUrl: string;
  workerSecret: string;
  securityId: string;
  currentContext: Record<string, unknown>;
}): Promise<Record<string, unknown> | null> {
  const res = await fetch(input.bridgeUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.workerSecret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action: "repeat_mover_get_context",
      security_id: input.securityId,
      current_context: input.currentContext,
    }),
  });
  if (!res.ok) return null;
  const payload = await res.json();
  if (!payload?.ok || !payload.context) return null;
  return payload.context as Record<string, unknown>;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const workerSecret = Deno.env.get("RADAR_WORKER_SECRET") ?? "";
  const bridgeUrl = `${supabaseUrl.replace(/\/$/, "")}/functions/v1/radar-worker-bridge`;

  if (!supabaseUrl || !anonKey || !serviceKey || !workerSecret) {
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: JSON_HEADERS,
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser();
  if (authError || !authData.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: JSON_HEADERS,
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_body" }), { status: 400, headers: JSON_HEADERS });
  }

  const requestsRaw = (body as Record<string, unknown>)?.requests;
  if (!Array.isArray(requestsRaw)) {
    return new Response(JSON.stringify({ error: "invalid_body" }), { status: 400, headers: JSON_HEADERS });
  }

  const requests = requestsRaw.slice(0, MAX_REQUESTS).map((raw) => {
    const row = raw as Record<string, unknown>;
    const symbol = readSymbol(row.symbol);
    return {
      symbol: symbol ?? "",
      securityId: typeof row.securityId === "string" ? row.securityId : null,
      currentContext: {
        symbol,
        movePct: row.movePct ?? null,
        volume: row.volume ?? null,
        rvol: row.rvol ?? null,
        dollarVolume: row.dollarVolume ?? null,
        direction: row.direction ?? null,
        tier: row.tier ?? null,
        sessionDate: row.sessionDate ?? null,
        recordedAt: row.recordedAt ?? null,
      },
    };
  }).filter((row) => row.symbol.length > 0);

  const db = createClient(supabaseUrl, serviceKey);

  const work = mapWithConcurrency(requests, CONCURRENCY, async (request) => {
    let securityId = request.securityId;
    if (!securityId) {
      try {
        securityId = await withTimeout(resolveSecurityId(db, request.symbol), PER_REQUEST_TIMEOUT_MS);
      } catch {
        securityId = null;
      }
    }
    if (!securityId) {
      return { symbol: request.symbol, securityId: null, historicalContext: null };
    }
    try {
      const historicalContext = await withTimeout(
        loadContextViaBridge({
          bridgeUrl,
          workerSecret,
          securityId,
          currentContext: request.currentContext,
        }),
        PER_REQUEST_TIMEOUT_MS,
      );
      return { symbol: request.symbol, securityId, historicalContext };
    } catch {
      return { symbol: request.symbol, securityId, historicalContext: null };
    }
  });

  try {
    const results = await withTimeout(work, BATCH_TIMEOUT_MS);
    return new Response(JSON.stringify({ results }), { status: 200, headers: JSON_HEADERS });
  } catch {
    return new Response(JSON.stringify({
      results: requests.map((request) => ({
        symbol: request.symbol,
        securityId: request.securityId,
        historicalContext: null,
      })),
    }), { status: 200, headers: JSON_HEADERS });
  }
});
