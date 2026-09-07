import {
  PREMARKET_SNAPSHOT_PAGE_CAP,
  type MinuteBar,
  type SnapshotTicker,
} from "./types";
import { parseMinuteBar } from "./volume";

export const SNAPSHOT_URL =
  "https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?include_otc=false";

function parseTickersPayload(body: unknown): unknown[] {
  if (body === null || typeof body !== "object") {
    throw new Error("polygon_snapshot_malformed");
  }
  const tickers = (body as { tickers?: unknown }).tickers;
  if (!Array.isArray(tickers)) throw new Error("polygon_snapshot_malformed");
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

async function fetchJson(
  url: string,
  apiKey: string,
  timeoutMs: number,
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`polygon_http_${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPolygonSnapshot(opts: {
  apiKey: string;
  pageCap?: number;
  timeoutMs?: number;
}): Promise<SnapshotTicker[]> {
  const pageCap = opts.pageCap ?? PREMARKET_SNAPSHOT_PAGE_CAP;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const all: SnapshotTicker[] = [];
  let url: string | null = SNAPSHOT_URL;
  let pages = 0;
  while (url && pages < pageCap) {
    pages += 1;
    const body = await fetchJson(url, opts.apiKey, timeoutMs);
    const tickers = parseTickersPayload(body);
    for (const item of tickers) {
      if (item !== null && typeof item === "object") {
        all.push(item as SnapshotTicker);
      }
    }
    const nextRaw =
      body !== null && typeof body === "object"
        ? (body as { next_url?: unknown }).next_url
        : null;
    url =
      typeof nextRaw === "string" && nextRaw.trim() !== ""
        ? stripApiKey(nextRaw)
        : null;
  }
  return all;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchMinuteAggregates(opts: {
  apiKey: string;
  symbol: string;
  fromMs: number;
  toMs: number;
  timeoutMs?: number;
}): Promise<MinuteBar[]> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const from = Math.trunc(opts.fromMs);
  const to = Math.trunc(opts.toMs);
  const url =
    `https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(opts.symbol)}` +
    `/range/1/minute/${from}/${to}?adjusted=true&sort=asc&limit=50000`;
  const body = await fetchJson(url, opts.apiKey, timeoutMs);
  if (body === null || typeof body !== "object") return [];
  const results = (body as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];
  const bars: MinuteBar[] = [];
  for (const raw of results) {
    const bar = parseMinuteBar(raw);
    if (bar) bars.push(bar);
  }
  return bars;
}

export async function fetchBarsForSymbols(opts: {
  apiKey: string;
  symbols: string[];
  fromMs: number;
  toMs: number;
  delayMs?: number;
}): Promise<{ barsBySymbol: Map<string, MinuteBar[]>; errors: string[] }> {
  const barsBySymbol = new Map<string, MinuteBar[]>();
  const errors: string[] = [];
  const delayMs = opts.delayMs ?? 80;
  for (const symbol of opts.symbols) {
    try {
      const bars = await fetchMinuteAggregates({
        apiKey: opts.apiKey,
        symbol,
        fromMs: opts.fromMs,
        toMs: opts.toMs,
      });
      barsBySymbol.set(symbol, bars);
    } catch (err) {
      barsBySymbol.set(symbol, []);
      errors.push(
        `${symbol}:${err instanceof Error ? err.message : "aggs_failed"}`,
      );
    }
    if (delayMs > 0) await sleep(delayMs);
  }
  return { barsBySymbol, errors };
}
