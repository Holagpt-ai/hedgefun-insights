/** Client-only classification of `analyze-watchlist-tickers-v2` invoke results. */

export const MARKET_CLOSED_TITLE = "Market closed";
export const MARKET_CLOSED_DESCRIPTION =
  "No new analysis is available on non-trading days.";
export const REFRESH_FAILED_TITLE = "Refresh failed";

export class WatchlistMarketClosedError extends Error {
  readonly code = "NON_TRADING_DAY" as const;
  constructor() {
    super(MARKET_CLOSED_DESCRIPTION);
    this.name = "WatchlistMarketClosedError";
  }
}

export type WatchlistRefreshOutcome =
  | { kind: "success"; data: unknown }
  | { kind: "market_closed" }
  | { kind: "error"; message: string };

export type RefreshToastSpec =
  | {
      variant: "info";
      title: typeof MARKET_CLOSED_TITLE;
      description: typeof MARKET_CLOSED_DESCRIPTION;
    }
  | { variant: "error"; title: typeof REFRESH_FAILED_TITLE; description: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonBody(value: unknown): unknown {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function httpStatusFromError(error: unknown): number | null {
  if (!isRecord(error)) return null;
  const context = error.context;
  if (isRecord(context) && typeof context.status === "number" && Number.isFinite(context.status)) {
    return context.status;
  }
  return typeof error.status === "number" && Number.isFinite(error.status) ? error.status : null;
}

async function readResponseJson(source: unknown): Promise<unknown> {
  if (!isRecord(source)) return null;
  try {
    if (typeof source.clone === "function") {
      const cloned = (source.clone as () => unknown)();
      if (isRecord(cloned) && typeof cloned.json === "function") {
        return await (cloned.json as () => Promise<unknown>)();
      }
    }
    if (typeof source.json === "function") {
      return await (source.json as () => Promise<unknown>)();
    }
  } catch {
    return null;
  }
  return null;
}

async function bodyFromErrorContext(error: unknown): Promise<unknown> {
  if (!isRecord(error)) return null;
  const fromResponse = parseJsonBody(await readResponseJson(error.context));
  if (fromResponse != null) return fromResponse;
  const context = error.context;
  // Plain JSON payload attached as context (tests / some adapters), not a Fetch Response.
  if (
    isRecord(context) &&
    typeof context.status === "string" &&
    typeof context.reason === "string"
  ) {
    return context;
  }
  return null;
}

export function isNonTradingDayPayload(httpStatus: number | null, body: unknown): boolean {
  if (httpStatus !== 422) return false;
  const parsed = parseJsonBody(body);
  if (!isRecord(parsed)) return false;
  return parsed.status === "not_applicable" && parsed.reason === "NON_TRADING_DAY";
}

export async function classifyWatchlistRefreshInvoke(
  data: unknown,
  error: unknown,
): Promise<WatchlistRefreshOutcome> {
  if (!error) return { kind: "success", data };

  const httpStatus = httpStatusFromError(error);
  const fromData = parseJsonBody(data);
  const fromContext = await bodyFromErrorContext(error);

  if (isNonTradingDayPayload(httpStatus, fromData) || isNonTradingDayPayload(httpStatus, fromContext)) {
    return { kind: "market_closed" };
  }

  const message =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : REFRESH_FAILED_TITLE;
  return { kind: "error", message };
}

export function toastSpecForRefreshOutcome(outcome: WatchlistRefreshOutcome): RefreshToastSpec | null {
  if (outcome.kind === "success") return null;
  if (outcome.kind === "market_closed") {
    return {
      variant: "info",
      title: MARKET_CLOSED_TITLE,
      description: MARKET_CLOSED_DESCRIPTION,
    };
  }
  return { variant: "error", title: REFRESH_FAILED_TITLE, description: outcome.message };
}

function isMarketClosedError(err: unknown): boolean {
  if (err instanceof WatchlistMarketClosedError) return true;
  return isRecord(err) && err.name === "WatchlistMarketClosedError" && err.code === "NON_TRADING_DAY";
}

export function toastSpecForRefreshError(err: unknown): RefreshToastSpec {
  if (isMarketClosedError(err)) {
    return {
      variant: "info",
      title: MARKET_CLOSED_TITLE,
      description: MARKET_CLOSED_DESCRIPTION,
    };
  }
  const description =
    err instanceof Error && err.message.trim().length > 0 ? err.message : REFRESH_FAILED_TITLE;
  return { variant: "error", title: REFRESH_FAILED_TITLE, description };
}

export function shouldInvalidateAfterRefresh(outcome: WatchlistRefreshOutcome): boolean {
  return outcome.kind === "success";
}
