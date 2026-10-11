import { isValidTicker } from "../../../../supabase/functions/_shared/catalyst/contract.ts";
import { buildCumulativeVolumeDiagnostic } from "./cumulative-volume.ts";

/** Bounded diagnostic traffic — protects Polygon quota and worker CPU. */
export const CUMULATIVE_VOLUME_DIAG_MAX_REQUESTS = 12;
export const CUMULATIVE_VOLUME_DIAG_WINDOW_MS = 60_000;

export type CumulativeVolumeRouteDeps = {
  radarWorkerSecret: string;
  polygonApiKey: string;
  nowMs?: () => number;
  fetchFn?: typeof fetch;
};

export type RateLimiter = {
  allow(nowMs: number): boolean;
};

export function createFixedWindowRateLimiter(opts: {
  maxRequests: number;
  windowMs: number;
}): RateLimiter {
  const max = Math.max(1, Math.trunc(opts.maxRequests));
  const windowMs = Math.max(1_000, Math.trunc(opts.windowMs));
  const timestamps: number[] = [];
  return {
    allow(nowMs: number): boolean {
      while (timestamps.length > 0 && nowMs - timestamps[0]! >= windowMs) {
        timestamps.shift();
      }
      if (timestamps.length >= max) return false;
      timestamps.push(nowMs);
      return true;
    },
  };
}

const JSON_HEADERS = { "Content-Type": "application/json" };

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export async function handleCumulativeVolumeDiagnostic(
  req: Request,
  deps: CumulativeVolumeRouteDeps,
  rateLimiter: RateLimiter,
): Promise<Response> {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const secret = req.headers.get("x-radar-worker-secret");
  if (secret !== deps.radarWorkerSecret) {
    return json(401, { error: "unauthorized" });
  }

  const nowMs = deps.nowMs?.() ?? Date.now();
  if (!rateLimiter.allow(nowMs)) {
    return json(429, { error: "rate_limited" });
  }

  const raw = urlSymbol(req);
  if (!raw) {
    return json(400, { error: "symbol_required" });
  }
  if (!isValidTicker(raw)) {
    return json(400, { error: "invalid_symbol" });
  }

  const body = await buildCumulativeVolumeDiagnostic({
    symbol: raw,
    polygonApiKey: deps.polygonApiKey,
    fetchFn: deps.fetchFn,
  });
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: JSON_HEADERS,
  });
}

function urlSymbol(req: Request): string | null {
  const url = new URL(req.url);
  const symbol = url.searchParams.get("symbol")?.trim().toUpperCase();
  return symbol && symbol.length > 0 ? symbol : null;
}
