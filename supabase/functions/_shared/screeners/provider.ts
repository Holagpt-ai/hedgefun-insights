// Bounded Polygon JSON fetch + response validation for Screener sync.
// Fail closed: never converts provider errors into empty arrays.

export const PROVIDER_TIMEOUT_MS = 15_000;

export class ProviderUnavailableError extends Error {
  readonly code = "provider_unavailable" as const;
  constructor(message = "provider_unavailable") {
    super(message);
    this.name = "ProviderUnavailableError";
  }
}

export type FetchLike = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Fetch URL with a fixed timeout, require HTTP success + parseable JSON.
 * Throws ProviderUnavailableError on timeout, non-OK status, or invalid JSON.
 * Never includes secrets or response bodies in the thrown message.
 */
export async function fetchJsonBounded(
  url: string,
  init: RequestInit = {},
  opts: { timeoutMs?: number; fetchImpl?: FetchLike } = {},
): Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  // Compose with any caller signal.
  const callerSignal = init.signal;
  const onCallerAbort = () => ctrl.abort();
  if (callerSignal) {
    if (callerSignal.aborted) ctrl.abort();
    else callerSignal.addEventListener("abort", onCallerAbort, { once: true });
  }
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new ProviderUnavailableError("provider_unavailable");
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new ProviderUnavailableError("provider_unavailable");
    }
    return body;
  } catch (e) {
    if (e instanceof ProviderUnavailableError) throw e;
    throw new ProviderUnavailableError("provider_unavailable");
  } finally {
    clearTimeout(timer);
    if (callerSignal) callerSignal.removeEventListener("abort", onCallerAbort);
  }
}

/** Require `{ tickers: array }` snapshot/gainers/losers shape. */
export function parseTickersPayload(body: unknown): unknown[] {
  if (body === null || typeof body !== "object") {
    throw new ProviderUnavailableError("provider_unavailable");
  }
  const tickers = (body as { tickers?: unknown }).tickers;
  if (!Array.isArray(tickers)) {
    throw new ProviderUnavailableError("provider_unavailable");
  }
  return tickers;
}
