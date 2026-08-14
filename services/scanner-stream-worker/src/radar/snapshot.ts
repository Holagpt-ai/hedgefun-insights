import type { PolygonTicker } from "../../../../supabase/functions/_shared/screeners/selection.ts";
import { isRetryableStatus, RetryableError, withRetry } from "../retry.ts";
import type { FetchLike } from "../baseline/grouped.ts";
import type { RadarV22Config } from "./config.ts";
import { eligibleUniverse } from "./eligibility.ts";
import type { EligibleQuote } from "./types.ts";

export const SNAPSHOT_URL =
  "https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?include_otc=false";

function parseTickersPayload(body: unknown): unknown[] {
  if (body === null || typeof body !== "object") {
    throw new RetryableError(502);
  }
  const tickers = (body as { tickers?: unknown }).tickers;
  if (!Array.isArray(tickers)) throw new RetryableError(502);
  return tickers;
}

function stripApiKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("apiKey");
    parsed.searchParams.delete("apikey");
    return parsed.toString();
  } catch {
    return url;
  }
}

async function fetchPage(
  url: string,
  apiKey: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<{ tickers: unknown[]; nextUrl: string | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    if (isRetryableStatus(res.status)) throw new RetryableError(res.status);
    if (!res.ok) throw new RetryableError(res.status);
    const body: unknown = await res.json();
    const tickers = parseTickersPayload(body);
    const nextRaw = body !== null && typeof body === "object"
      ? (body as { next_url?: unknown }).next_url
      : null;
    const nextUrl = typeof nextRaw === "string" && nextRaw.trim() !== ""
      ? stripApiKey(nextRaw)
      : null;
    return { tickers, nextUrl };
  } finally {
    clearTimeout(timer);
  }
}

export async function refreshEligibleUniverse(opts: {
  apiKey: string;
  fetch: FetchLike;
  config: RadarV22Config;
  sleep?: (ms: number) => Promise<void>;
}): Promise<Map<string, EligibleQuote>> {
  const all: PolygonTicker[] = [];
  let url: string | null = SNAPSHOT_URL;
  let pages = 0;
  while (url && pages < opts.config.snapshotPageCap) {
    pages += 1;
    const capturedUrl: string = url;
    const page: { tickers: unknown[]; nextUrl: string | null } =
      await withRetry(
        () =>
          fetchPage(
            capturedUrl,
            opts.apiKey,
            opts.fetch,
            opts.config.snapshotTimeoutMs,
          ),
        { sleep: opts.sleep },
      );
    for (const item of page.tickers) {
      if (item !== null && typeof item === "object") {
        all.push(item as PolygonTicker);
      }
    }
    url = page.nextUrl;
  }
  return eligibleUniverse(all);
}
