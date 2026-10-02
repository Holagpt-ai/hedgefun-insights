import { parseCompanyTickersExchangeJson, SEC_COMPANY_TICKERS_EXCHANGE_URL, SEC_REQUEST_TIMEOUT_MS } from "../sec-edgar/ingest.ts";

/** Company-map attempts. Transient failures retry once. This does not stack the Atom requester's longer retry loop. */
export const SEC_COMPANY_MAP_MAX_ATTEMPTS = 2;
/** Shorter than a second and above the SEC 5-request/second spacing. */
export const SEC_COMPANY_MAP_RETRY_DELAY_MS = 350;
export const SEC_COMPANY_MAP_URL_ID = "company_tickers_exchange.json";

export type SecCompanyMapErrorType = "timeout" | "network" | "http" | "parse";

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
}

export type SecCompanyMapResult =
  | { ok: true; map: Map<string, string[]>; attempts: number }
  | { ok: false; diagnostic: SecCompanyMapDiagnostic };

export async function loadSecCompanyTickerMap(input: {
  userAgent: string;
  fetchImpl?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
}): Promise<SecCompanyMapResult> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const sleepFn = input.sleepFn ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last: SecCompanyMapDiagnostic | null = null;
  for (let attempt = 1; attempt <= SEC_COMPANY_MAP_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await sleepFn(SEC_COMPANY_MAP_RETRY_DELAY_MS);
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
    const snippet = await safeProviderSnippet(response);
    const retryable = isTransientStatus(response.status);
    return {
      ok: false,
      diagnostic: diagnostic({
        httpStatus: response.status,
        errorType: "http",
        retryable,
        message: httpMessage(response.status, snippet),
      }),
    };
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
