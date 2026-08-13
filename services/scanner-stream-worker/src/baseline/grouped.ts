import { isRetryableStatus, RetryableError, withRetry } from "../retry.ts";

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type BarHL = { h: number; l: number };
export type DailyCache = Map<string, Map<string, BarHL>>;

export const GROUPED_BASE =
  "https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks";
export const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]*$/;
export const SYMBOL_MAX_LEN = 12;
export const GROUPED_FETCH_CONCURRENCY = 4;
export const GROUPED_TIMEOUT_MS = 15_000;

export class ProviderError extends Error {
  readonly code: "provider_unavailable" | "provider_response_invalid";
  constructor(code: "provider_unavailable" | "provider_response_invalid") {
    super(code);
    this.name = "ProviderError";
    this.code = code;
  }
}

export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const symbol = raw.trim().toUpperCase();
  if (!symbol || symbol.length > SYMBOL_MAX_LEN) return null;
  if (!SYMBOL_RE.test(symbol)) return null;
  return symbol;
}

export function isValidHighLow(high: number, low: number): boolean {
  return (
    Number.isFinite(high) &&
    Number.isFinite(low) &&
    high > 0 &&
    low > 0 &&
    high >= low
  );
}

export function groupedUrl(date: string): string {
  return `${GROUPED_BASE}/${date}?adjusted=true`;
}

export function parseGroupedResults(body: unknown): Map<string, BarHL> {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new ProviderError("provider_response_invalid");
  }
  const results = (body as { results?: unknown }).results;
  if (results === undefined || results === null) return new Map();
  if (!Array.isArray(results)) {
    throw new ProviderError("provider_response_invalid");
  }

  const out = new Map<string, BarHL>();
  for (const item of results) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const row = item as { T?: unknown; h?: unknown; l?: unknown };
    const symbol = normalizeSymbol(row.T);
    if (!symbol) continue;
    const high = Number(row.h);
    const low = Number(row.l);
    if (!isValidHighLow(high, low)) continue;
    out.set(symbol, { h: high, l: low });
  }
  return out;
}

async function fetchGroupedDay(
  date: string,
  apiKey: string,
  fetchImpl: FetchLike,
  opts: {
    timeoutMs: number;
    signal?: AbortSignal;
  },
): Promise<Map<string, BarHL>> {
  if (opts.signal?.aborted) throw new ProviderError("provider_unavailable");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs);
  const onCallerAbort = () => ctrl.abort();
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort();
    else opts.signal.addEventListener("abort", onCallerAbort, { once: true });
  }
  try {
    const res = await fetchImpl(groupedUrl(date), {
      method: "GET",
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ctrl.signal,
    });
    if (isRetryableStatus(res.status)) {
      throw new RetryableError(res.status);
    }
    if (!res.ok) throw new ProviderError("provider_unavailable");
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ProviderError("provider_response_invalid");
    }
    return parseGroupedResults(body);
  } catch (error) {
    if (error instanceof RetryableError || error instanceof ProviderError) {
      throw error;
    }
    if (ctrl.signal.aborted) throw new RetryableError(0);
    throw new ProviderError("provider_unavailable");
  } finally {
    clearTimeout(timer);
    if (opts.signal) {
      opts.signal.removeEventListener("abort", onCallerAbort);
    }
  }
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function fillGroupedCache(
  dates: string[],
  cache: DailyCache,
  deps: {
    fetch: FetchLike;
    apiKey: string;
    concurrency?: number;
    signal?: AbortSignal;
    sleep?: (ms: number) => Promise<void>;
    timeoutMs?: number;
  },
): Promise<void> {
  const missing = dates.filter((date) => !cache.has(date));
  if (missing.length === 0) return;

  await mapPool(
    missing,
    deps.concurrency ?? GROUPED_FETCH_CONCURRENCY,
    async (date) => {
      const bars = await withRetry(
        () =>
          fetchGroupedDay(date, deps.apiKey, deps.fetch, {
            timeoutMs: deps.timeoutMs ?? GROUPED_TIMEOUT_MS,
            signal: deps.signal,
          }),
        { sleep: deps.sleep },
      );
      cache.set(date, bars);
    },
  );
}

export function pruneCache(
  cache: DailyCache,
  periodStart: string,
  periodEnd: string,
): void {
  for (const date of cache.keys()) {
    if (date < periodStart || date > periodEnd) cache.delete(date);
  }
}

export function symbolsInWindow(
  cache: DailyCache,
  dates: string[],
): string[] {
  const symbols = new Set<string>();
  for (const date of dates) {
    const day = cache.get(date);
    if (!day) continue;
    for (const symbol of day.keys()) symbols.add(symbol);
  }
  return [...symbols].sort();
}
