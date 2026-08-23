import { describe, expect, it } from "vitest";
import {
  MARKET_CLOSED_DESCRIPTION,
  MARKET_CLOSED_TITLE,
  REFRESH_FAILED_TITLE,
  WatchlistMarketClosedError,
  classifyWatchlistRefreshInvoke,
  isNonTradingDayPayload,
  shouldInvalidateAfterRefresh,
  toastSpecForRefreshError,
  toastSpecForRefreshOutcome,
} from "@/lib/watchlist-v2/refresh-response";

const GENERIC_INVOKE_MESSAGE = "Edge Function returned a non-2xx status code";

function functionsHttpError(status: number, body: unknown, { attachData = false } = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  const context = new Response(payload, {
    status,
    headers: { "Content-Type": "application/json" },
  });
  const error = Object.assign(new Error(GENERIC_INVOKE_MESSAGE), {
    name: "FunctionsHttpError",
    context,
  });
  return { error, data: attachData ? body : null };
}

describe("isNonTradingDayPayload", () => {
  it("matches only HTTP 422 + not_applicable + NON_TRADING_DAY", () => {
    expect(
      isNonTradingDayPayload(422, { status: "not_applicable", reason: "NON_TRADING_DAY" }),
    ).toBe(true);
    expect(
      isNonTradingDayPayload(422, { status: "not_applicable", reason: "OUTSIDE_SESSION_WINDOW" }),
    ).toBe(false);
    expect(isNonTradingDayPayload(500, { status: "not_applicable", reason: "NON_TRADING_DAY" })).toBe(
      false,
    );
  });
});

describe("classifyWatchlistRefreshInvoke", () => {
  it("treats a 422 NON_TRADING_DAY body as market closed, not a failed refresh", async () => {
    const body = { status: "not_applicable", reason: "NON_TRADING_DAY" };
    const { error, data } = functionsHttpError(422, body, { attachData: true });
    const outcome = await classifyWatchlistRefreshInvoke(data, error);
    const toast = toastSpecForRefreshOutcome(outcome);

    expect(outcome).toEqual({ kind: "market_closed" });
    expect(shouldInvalidateAfterRefresh(outcome)).toBe(false);
    expect(toast).toEqual({
      variant: "info",
      title: MARKET_CLOSED_TITLE,
      description: MARKET_CLOSED_DESCRIPTION,
    });
    expect(toast?.title).toBe("Market closed");
    expect(toast?.description).toBe("No new analysis is available on non-trading days.");
    expect(toast?.title).not.toBe(REFRESH_FAILED_TITLE);
    expect(JSON.stringify(toast)).not.toMatch(/Refresh failed/i);

    const errorToast = toastSpecForRefreshError(new WatchlistMarketClosedError());
    expect(errorToast).toEqual(toast);
    expect(JSON.stringify(errorToast)).not.toMatch(/Refresh failed/i);
  });

  it("still classifies NON_TRADING_DAY when the body is only on the Response context", async () => {
    const { error, data } = functionsHttpError(422, {
      status: "not_applicable",
      reason: "NON_TRADING_DAY",
    });
    const outcome = await classifyWatchlistRefreshInvoke(data, error);
    const toast = toastSpecForRefreshOutcome(outcome);

    expect(data).toBeNull();
    expect(outcome.kind).toBe("market_closed");
    expect(toast?.variant).toBe("info");
    expect(toast?.title).toBe(MARKET_CLOSED_TITLE);
    expect(JSON.stringify(toast)).not.toMatch(/Refresh failed/i);
  });

  it("still classifies NON_TRADING_DAY when data is only the generic FunctionsHttpError envelope", async () => {
    const { error } = functionsHttpError(422, {
      status: "not_applicable",
      reason: "NON_TRADING_DAY",
    });
    const outcome = await classifyWatchlistRefreshInvoke(
      { message: GENERIC_INVOKE_MESSAGE },
      error,
    );
    const toast = toastSpecForRefreshOutcome(outcome);

    expect(outcome.kind).toBe("market_closed");
    expect(toast?.title).toBe(MARKET_CLOSED_TITLE);
    expect(JSON.stringify(toast)).not.toMatch(/Refresh failed/i);
  });

  it("reads a duck-typed context.json() body, not only the generic error message", async () => {
    const error = Object.assign(new Error(GENERIC_INVOKE_MESSAGE), {
      name: "FunctionsHttpError",
      context: {
        status: 422,
        json: async () => ({ status: "not_applicable", reason: "NON_TRADING_DAY" }),
      },
    });
    const outcome = await classifyWatchlistRefreshInvoke(null, error);
    expect(outcome.kind).toBe("market_closed");
    expect(JSON.stringify(toastSpecForRefreshOutcome(outcome))).not.toMatch(/Refresh failed/i);
  });

  it("sends a different 422 through the normal error path", async () => {
    const { error, data } = functionsHttpError(422, {
      status: "not_applicable",
      reason: "OUTSIDE_SESSION_WINDOW",
    });
    const outcome = await classifyWatchlistRefreshInvoke(data, error);
    const toast = toastSpecForRefreshOutcome(outcome);

    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") return;
    expect(outcome.message).toBe(GENERIC_INVOKE_MESSAGE);
    expect(shouldInvalidateAfterRefresh(outcome)).toBe(false);
    expect(toast).toEqual({
      variant: "error",
      title: REFRESH_FAILED_TITLE,
      description: GENERIC_INVOKE_MESSAGE,
    });
    expect(toastSpecForRefreshError(error)).toEqual(toast);
  });

  it("sends a 500 through the normal error path", async () => {
    const { error, data } = functionsHttpError(500, { status: "failed", error_code: "UPSTREAM_ERROR" });
    const outcome = await classifyWatchlistRefreshInvoke(data, error);
    const toast = toastSpecForRefreshOutcome(outcome);

    expect(outcome.kind).toBe("error");
    if (outcome.kind !== "error") return;
    expect(outcome.message).toBe(GENERIC_INVOKE_MESSAGE);
    expect(shouldInvalidateAfterRefresh(outcome)).toBe(false);
    expect(toast?.variant).toBe("error");
    expect(toast?.title).toBe(REFRESH_FAILED_TITLE);
    expect(toastSpecForRefreshError(error).title).toBe(REFRESH_FAILED_TITLE);
  });

  it("leaves successful refresh unchanged", async () => {
    const data = { status: "ok", ticker: "AAPL", analyzed_at: "2026-08-21T14:00:00Z" };
    const outcome = await classifyWatchlistRefreshInvoke(data, null);

    expect(outcome).toEqual({ kind: "success", data });
    expect(shouldInvalidateAfterRefresh(outcome)).toBe(true);
    expect(toastSpecForRefreshOutcome(outcome)).toBeNull();
  });
});
