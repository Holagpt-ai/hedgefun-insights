import { isValidTicker } from "../catalyst/contract.ts";
import { parseCompanyTickersExchangeJson, SEC_COMPANY_TICKERS_EXCHANGE_URL, SEC_REQUEST_TIMEOUT_MS } from "../sec-edgar/ingest.ts";

/** Company-map attempts. Transient failures retry once. This does not stack the Atom requester's longer retry loop. */
export const SEC_COMPANY_MAP_MAX_ATTEMPTS = 2;
/** Delay for non-429 transient retries. Shorter than a second and above the SEC 5-request/second spacing. */
export const SEC_COMPANY_MAP_RETRY_DELAY_MS = 350;
/** Used when a 429 response has no usable Retry-After. */
export const SEC_COMPANY_MAP_RETRY_AFTER_DEFAULT_MS = 5_000;
/** Upper bound for a single 429 wait. Two attempts total, so this cannot stack. */
export const SEC_COMPANY_MAP_RETRY_DELAY_MAX_MS = 10_000;
export const SEC_COMPANY_MAP_FRESH_TTL_SECONDS = 21_600;
export const SEC_COMPANY_MAP_MAX_STALE_SECONDS = 86_400;
/**
 * The live exchange file contains thousands of issuers.
 * Empty, HTML, and toy payloads fail this floor and cannot replace a last-known-good map.
 */
export const SEC_COMPANY_MAP_MIN_ISSUERS = 1_000;
export const SEC_COMPANY_MAP_CACHE_KEY = "sec_company_ticker_map";
export const SEC_COMPANY_MAP_PAYLOAD_VERSION = 1;
export const SEC_COMPANY_MAP_URL_ID = "company_tickers_exchange.json";

export type SecCompanyMapErrorType = "timeout" | "network" | "http" | "parse";

export type SecCompanyMapSource = "cache" | "live_refresh" | "lkg_fallback";

export type SecCompanyMapCacheState =
  | "cache_fresh"
  | "cache_stale_refresh_attempted"
  | "cache_refreshed"
  | "cache_lkg_fallback"
  | "cache_missing"
  | "cache_expired"
  | "cache_validation_failed";

export type SecCompanyMapProviderCondition =
  | "provider_429"
  | "provider_403"
  | "provider_5xx"
  | "provider_timeout"
  | "provider_malformed";

export interface SecCompanyMapDiagnostic {
  category: "sec_provider_dependency_error";
  stage: "company_ticker_map";
  provider: "sec";
  urlIdentifier: typeof SEC_COMPANY_MAP_URL_ID;
  httpStatus: number | null;
  errorType: SecCompanyMapErrorType;
  retryable: boolean;
  message: string;
  attempt: number;
  attempts: number;
  retryAfterMs?: number | null;
}

export interface SecCompanyMapPayload {
  version: typeof SEC_COMPANY_MAP_PAYLOAD_VERSION;
  entries: [string, string[]][];
}

export interface SecCompanyMapCacheReader {
  getProviderCache(cacheKey: string): Promise<{ payload: unknown; refreshedAt: string } | null>;
  saveProviderCache(record: { cacheKey: string; payload: unknown; refreshedAt: string }): Promise<void>;
}

export interface SecCompanyMapResolution {
  ok: boolean;
  map: Map<string, string[]> | null;
  attempts: number;
  source: SecCompanyMapSource | null;
  state: SecCompanyMapCacheState;
  states: string[];
  ageSeconds: number | null;
  refreshedAt: string | null;
  httpStatus: number | null;
  providerCondition: SecCompanyMapProviderCondition | null;
  errorType: SecCompanyMapErrorType | null;
  refreshAttempted: boolean;
  diagnostic: SecCompanyMapDiagnostic | null;
}

export type SecCompanyMapResult =
  | { ok: true; map: Map<string, string[]>; attempts: number }
  | { ok: false; diagnostic: SecCompanyMapDiagnostic };

/**
 * Last validated writer wins. The upsert replaces one cache row only after parse,
 * normalize, and validation. A failed refresh does not write. Overlapping successful
 * refreshes can reorder which validated payload lands last. That is not a source lock.
 */
export async function resolveSecCompanyTickerMap(input: {
  now: Date;
  userAgent: string;
  cache: SecCompanyMapCacheReader;
  fetchImpl?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<SecCompanyMapResolution> {
  const stored = await input.cache.getProviderCache(SEC_COMPANY_MAP_CACHE_KEY);
  const decoded = stored ? decodeSecCompanyMap(stored.payload) : null;
  const ageSeconds = stored ? cacheAgeSeconds(stored.refreshedAt, input.now) : null;
  const fresh = Boolean(decoded && ageSeconds != null && ageSeconds <= SEC_COMPANY_MAP_FRESH_TTL_SECONDS);
  const staleEligible = Boolean(
    decoded &&
      ageSeconds != null &&
      ageSeconds > SEC_COMPANY_MAP_FRESH_TTL_SECONDS &&
      ageSeconds <= SEC_COMPANY_MAP_MAX_STALE_SECONDS,
  );

  if (fresh && decoded && stored) {
    return resolution({
      ok: true,
      map: decoded,
      attempts: 0,
      source: "cache",
      states: ["cache_fresh"],
      ageSeconds,
      refreshedAt: stored.refreshedAt,
      refreshAttempted: false,
    });
  }

  const live = await loadSecCompanyTickerMap({
    userAgent: input.userAgent,
    fetchImpl: input.fetchImpl,
    sleepFn: input.sleepFn,
  });
  if (live.ok && live.map.size >= SEC_COMPANY_MAP_MIN_ISSUERS) {
    const refreshedAt = input.now.toISOString();
    await input.cache.saveProviderCache({
      cacheKey: SEC_COMPANY_MAP_CACHE_KEY,
      payload: encodeSecCompanyMap(live.map),
      refreshedAt,
    });
    const states = staleEligible
      ? ["cache_stale_refresh_attempted", "cache_refreshed"]
      : ["cache_refreshed"];
    return resolution({
      ok: true,
      map: live.map,
      attempts: live.attempts,
      source: "live_refresh",
      states,
      ageSeconds: 0,
      refreshedAt,
      refreshAttempted: true,
    });
  }

  const diagnostic = live.ok ? validationFailure(live.attempts) : live.diagnostic;
  const condition = secCompanyMapProviderCondition(diagnostic);
  if (staleEligible && decoded && stored) {
    const states = ["cache_stale_refresh_attempted"];
    if (condition) states.push(condition);
    states.push("cache_lkg_fallback");
    return resolution({
      ok: true,
      map: decoded,
      attempts: diagnostic.attempts,
      source: "lkg_fallback",
      states,
      ageSeconds,
      refreshedAt: stored.refreshedAt,
      httpStatus: diagnostic.httpStatus,
      providerCondition: condition,
      errorType: diagnostic.errorType,
      refreshAttempted: true,
      diagnostic,
    });
  }

  const failureState = failureCacheState(stored != null, decoded != null, ageSeconds, diagnostic);
  const states: string[] = [failureState];
  if (condition) states.push(condition);
  return resolution({
    ok: false,
    map: null,
    attempts: diagnostic.attempts,
    source: null,
    states,
    ageSeconds: decoded ? ageSeconds : null,
    refreshedAt: null,
    httpStatus: diagnostic.httpStatus,
    providerCondition: condition,
    errorType: diagnostic.errorType,
    refreshAttempted: true,
    diagnostic,
  });
}

export function encodeSecCompanyMap(map: Map<string, string[]>): SecCompanyMapPayload {
  const entries = [...map.entries()]
    .map(([cik, tickers]) => [cik, [...tickers]] as [string, string[]])
    .sort((a, b) => a[0].localeCompare(b[0]));
  return { version: SEC_COMPANY_MAP_PAYLOAD_VERSION, entries };
}

export function decodeSecCompanyMap(payload: unknown): Map<string, string[]> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const body = payload as { version?: unknown; entries?: unknown };
  if (body.version !== SEC_COMPANY_MAP_PAYLOAD_VERSION || !Array.isArray(body.entries)) return null;
  const map = new Map<string, string[]>();
  for (const row of body.entries) {
    if (!Array.isArray(row) || row.length !== 2) return null;
    const cik = row[0];
    const tickers = row[1];
    if (typeof cik !== "string" || !/^\d{10}$/.test(cik) || map.has(cik)) return null;
    if (!Array.isArray(tickers) || tickers.length === 0) return null;
    const cleaned: string[] = [];
    const seen = new Set<string>();
    for (const ticker of tickers) {
      if (typeof ticker !== "string" || !isValidTicker(ticker) || seen.has(ticker)) return null;
      seen.add(ticker);
      cleaned.push(ticker);
    }
    map.set(cik, cleaned);
  }
  if (map.size < SEC_COMPANY_MAP_MIN_ISSUERS) return null;
  return map;
}

export function secCompanyMapRetryDelayMs(
  httpStatus: number | null,
  retryAfterHeader: string | null,
  nowMs = Date.now(),
): number {
  if (httpStatus !== 429) return SEC_COMPANY_MAP_RETRY_DELAY_MS;
  const parsed = parseRetryAfterMs(retryAfterHeader, nowMs);
  const chosen = parsed == null ? SEC_COMPANY_MAP_RETRY_AFTER_DEFAULT_MS : parsed;
  return Math.min(SEC_COMPANY_MAP_RETRY_DELAY_MAX_MS, Math.max(0, chosen));
}

export function secCompanyMapProviderCondition(
  diagnostic: SecCompanyMapDiagnostic,
): SecCompanyMapProviderCondition | null {
  if (diagnostic.errorType === "timeout" || diagnostic.errorType === "network" || diagnostic.httpStatus === 408) {
    return "provider_timeout";
  }
  if (diagnostic.errorType === "parse") return "provider_malformed";
  if (diagnostic.httpStatus === 429) return "provider_429";
  if (diagnostic.httpStatus === 403) return "provider_403";
  if (diagnostic.httpStatus != null && diagnostic.httpStatus >= 500) return "provider_5xx";
  return null;
}

export async function loadSecCompanyTickerMap(input: {
  userAgent: string;
  fetchImpl?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<SecCompanyMapResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleepFn = input.sleepFn ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last: SecCompanyMapDiagnostic | null = null;
  for (let attempt = 1; attempt <= SEC_COMPANY_MAP_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1 && last) {
      const delay = last.httpStatus === 429
        ? (last.retryAfterMs ?? SEC_COMPANY_MAP_RETRY_AFTER_DEFAULT_MS)
        : SEC_COMPANY_MAP_RETRY_DELAY_MS;
      await sleepFn(delay);
    }
    const outcome = await fetchCompanyMapOnce(fetchImpl, input.userAgent);
    if (outcome.ok) return { ok: true, map: outcome.map, attempts: attempt };
    last = { ...outcome.diagnostic, attempt, attempts: attempt };
    if (!outcome.diagnostic.retryable) break;
  }
  return { ok: false, diagnostic: last ?? parseFailure(1) };
}

async function fetchCompanyMapOnce(
  fetchImpl: typeof fetch,
  userAgent: string,
): Promise<{ ok: true; map: Map<string, string[]> } | { ok: false; diagnostic: SecCompanyMapDiagnostic }> {
  let response: Response;
  try {
    response = await fetchImpl(SEC_COMPANY_TICKERS_EXCHANGE_URL, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(SEC_REQUEST_TIMEOUT_MS),
      headers: {
        "User-Agent": userAgent,
        "Accept": "application/json, text/plain",
      },
    });
  } catch (err) {
    const timedOut = isTimeout(err);
    return {
      ok: false,
      diagnostic: diagnostic({
        httpStatus: null,
        errorType: timedOut ? "timeout" : "network",
        retryable: true,
        message: timedOut ? "SEC company ticker map timed out" : "SEC company ticker map network failure",
      }),
    };
  }

  if (!response.ok) {
    const retryAfterMs = response.status === 429
      ? secCompanyMapRetryDelayMs(429, response.headers.get("retry-after"))
      : null;
    const snippet = await safeProviderSnippet(response);
    const retryable = isTransientStatus(response.status);
    const failure = diagnostic({
      httpStatus: response.status,
      errorType: "http",
      retryable,
      message: httpMessage(response.status, snippet),
    });
    if (retryAfterMs != null) failure.retryAfterMs = retryAfterMs;
    return { ok: false, diagnostic: failure };
  }

  const type = response.headers.get("content-type") ?? "";
  if (type && !/json|text\/plain/i.test(type)) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, diagnostic: parseFailure(response.status) };
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { ok: false, diagnostic: parseFailure(response.status) };
  }
  const parsed = parseCompanyTickersExchangeJson(payload);
  const map = new Map<string, string[]>();
  for (const [cik, rows] of parsed) map.set(cik, rows.map((row) => row.ticker));
  if (map.size === 0) return { ok: false, diagnostic: parseFailure(response.status) };
  return { ok: true, map };
}

function resolution(input: {
  ok: boolean;
  map: Map<string, string[]> | null;
  attempts: number;
  source: SecCompanyMapSource | null;
  states: string[];
  ageSeconds: number | null;
  refreshedAt: string | null;
  refreshAttempted: boolean;
  httpStatus?: number | null;
  providerCondition?: SecCompanyMapProviderCondition | null;
  errorType?: SecCompanyMapErrorType | null;
  diagnostic?: SecCompanyMapDiagnostic | null;
}): SecCompanyMapResolution {
  const cacheStates = input.states.filter((state) => state.startsWith("cache_"));
  const state = (cacheStates[cacheStates.length - 1] ?? "cache_missing") as SecCompanyMapCacheState;
  return {
    ok: input.ok,
    map: input.map,
    attempts: input.attempts,
    source: input.source,
    state,
    states: input.states,
    ageSeconds: input.ageSeconds,
    refreshedAt: input.refreshedAt,
    httpStatus: input.httpStatus ?? null,
    providerCondition: input.providerCondition ?? null,
    errorType: input.errorType ?? null,
    refreshAttempted: input.refreshAttempted,
    diagnostic: input.diagnostic ?? null,
  };
}

function failureCacheState(
  hadRow: boolean,
  decoded: boolean,
  ageSeconds: number | null,
  diagnostic: SecCompanyMapDiagnostic,
): SecCompanyMapCacheState {
  if (hadRow && decoded && ageSeconds != null && ageSeconds > SEC_COMPANY_MAP_MAX_STALE_SECONDS) return "cache_expired";
  if (hadRow && !decoded) return "cache_validation_failed";
  if (diagnostic.errorType === "parse") return "cache_validation_failed";
  if (!hadRow) return "cache_missing";
  return "cache_validation_failed";
}

function cacheAgeSeconds(refreshedAt: string, now: Date): number | null {
  const ms = Date.parse(refreshedAt);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor((now.getTime() - ms) / 1000));
}

function parseRetryAfterMs(header: string | null, nowMs: number): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const dateMs = Date.parse(trimmed);
  if (!Number.isFinite(dateMs)) return null;
  return dateMs - nowMs;
}

function validationFailure(attempts: number): SecCompanyMapDiagnostic {
  return {
    ...parseFailure(200),
    message: "SEC company ticker map failed validation",
    attempt: attempts,
    attempts,
  };
}

function diagnostic(input: {
  httpStatus: number | null;
  errorType: SecCompanyMapErrorType;
  retryable: boolean;
  message: string;
}): SecCompanyMapDiagnostic {
  return {
    category: "sec_provider_dependency_error",
    stage: "company_ticker_map",
    provider: "sec",
    urlIdentifier: SEC_COMPANY_MAP_URL_ID,
    httpStatus: input.httpStatus,
    errorType: input.errorType,
    retryable: input.retryable,
    message: input.message.slice(0, 180),
    attempt: 1,
    attempts: 1,
  };
}

function parseFailure(httpStatus: number | null): SecCompanyMapDiagnostic {
  return diagnostic({
    httpStatus,
    errorType: "parse",
    retryable: false,
    message: "SEC company ticker map parse failed",
  });
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isTimeout(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === "TimeoutError" || name === "AbortError";
}

function httpMessage(status: number, snippet: string): string {
  const base = `SEC company ticker map HTTP ${status}`;
  return snippet ? `${base}: ${snippet}`.slice(0, 180) : base;
}

async function safeProviderSnippet(response: Response): Promise<string> {
  const type = response.headers.get("content-type") ?? "";
  if (!/text\/plain|application\/json/i.test(type)) {
    await response.body?.cancel();
    return "";
  }
  try {
    const text = await response.text();
    return sanitizeProviderText(text);
  } catch {
    return "";
  }
}

export function sanitizeProviderText(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (!compact || compact.includes("<") || /bearer\s+/i.test(compact) || /user-agent/i.test(compact) || /authorization/i.test(compact)) {
    return "";
  }
  return compact.slice(0, 120);
}
