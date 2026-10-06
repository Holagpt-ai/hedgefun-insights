import { getEtParts, tradingSessionDateForInstant } from "@/lib/market-calendar";
import { normalizeChartBarTime } from "./chart-time";
import type { RadarChartBar } from "./types";

export type RadarChartInterval = "1m" | "5m";

/**
 * ET date passed to Polygon minute aggregates.
 * Live extended hours (04:00 inclusive through 20:00 exclusive) use that
 * trading day. Weekends, holidays, and the overnight window before 04:00 ET
 * use the previous completed session so a closed calendar date is not requested.
 */
export function radarChartSessionDate(
  providerAsOfMax: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  const parsed = providerAsOfMax ? Date.parse(providerAsOfMax) : Number.NaN;
  const instant = new Date(Number.isFinite(parsed) ? parsed : nowMs);
  const et = getEtParts(instant);
  return tradingSessionDateForInstant(et.date, et.minutes);
}

export type IntradayChartReason =
  | "ok"
  | "NO_TRADING_SESSION"
  | "NO_BARS_YET"
  | "PROVIDER_EMPTY"
  | "REQUEST_ERROR"
  | "SESSION_CLOSED_USE_PRIOR";

export interface IntradayChartDiagnostic {
  symbol: string;
  requested_session: string;
  requested_date: string;
  provider_status: string;
  bars_returned: number;
  market_state: "LIVE" | "CLOSED";
  resolved_trading_day: string;
  cache_state: "hit" | "miss" | "skipped_empty";
  reason_code: IntradayChartReason;
}

export function intradayChartDiagnostic(input: {
  symbol: string;
  requestedDate: string;
  providerStatus: string;
  barsReturned: number;
  cacheState: IntradayChartDiagnostic["cache_state"];
  closedSession: boolean;
  providerOk: boolean;
}): IntradayChartDiagnostic {
  let reason: IntradayChartReason = "ok";
  if (!input.providerOk) reason = "REQUEST_ERROR";
  else if (input.barsReturned === 0) reason = "PROVIDER_EMPTY";
  else if (input.closedSession) reason = "SESSION_CLOSED_USE_PRIOR";
  return {
    symbol: input.symbol,
    requested_session: input.closedSession ? "last_completed" : "current",
    requested_date: input.requestedDate,
    provider_status: input.providerStatus,
    bars_returned: input.barsReturned,
    market_state: input.closedSession ? "CLOSED" : "LIVE",
    resolved_trading_day: input.requestedDate,
    cache_state: input.cacheState,
    reason_code: reason,
  };
}

export function radarChartCacheKey(
  symbol: string,
  sessionDate: string,
  interval: RadarChartInterval,
): string {
  return `${symbol}::${sessionDate}::${interval}`;
}

/** Empty aggregates must not stick in cache and suppress a later print. */
export function shouldPersistRadarChartCache(barCount: number): boolean {
  return barCount > 0;
}

/** LIVE only inside a trading day's extended session [04:00, 20:00) ET. */
export function radarChartMarketState(nowMs: number): "LIVE" | "CLOSED" {
  const et = getEtParts(new Date(nowMs));
  const sessionDate = tradingSessionDateForInstant(et.date, et.minutes);
  if (sessionDate !== et.date || et.minutes >= 20 * 60) return "CLOSED";
  return "LIVE";
}

export function unwrapAggregateResults(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const results = (payload as { results?: unknown }).results;
    if (Array.isArray(results)) return results;
  }
  return [];
}

export function mapAggregates(payload: unknown): {
  bars: RadarChartBar[];
  latestBarIso: string | null;
} {
  const results = unwrapAggregateResults(payload);
  const bars: RadarChartBar[] = [];
  for (const raw of results) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const o = Number(r.o);
    const h = Number(r.h);
    const l = Number(r.l);
    const c = Number(r.c);
    const v = Number(r.v);
    if (![o, h, l, c, v].every((n) => Number.isFinite(n))) continue;
    if (!(l <= h)) continue;

    const timeRaw =
      r.t ??
      (typeof r.timestamp === "string" || typeof r.timestamp === "number" ? r.timestamp : null);
    const time = normalizeChartBarTime(timeRaw);
    if (time === null) continue;

    let providerTimeIso: string | undefined;
    if (typeof r.t === "number" && Number.isFinite(r.t)) {
      providerTimeIso = new Date(r.t > 1e12 ? r.t : r.t * 1000).toISOString();
    }

    bars.push({
      time,
      open: o,
      high: h,
      low: l,
      close: c,
      volume: v,
      providerTimeIso,
    });
  }

  bars.sort((a, b) => {
    const ta = typeof a.time === "number" ? a.time : Date.parse(String(a.time)) / 1000;
    const tb = typeof b.time === "number" ? b.time : Date.parse(String(b.time)) / 1000;
    return ta - tb;
  });

  const latestBarIso =
    bars.length > 0
      ? bars[bars.length - 1].providerTimeIso ??
        (typeof bars[bars.length - 1].time === "number"
          ? new Date((bars[bars.length - 1].time as number) * 1000).toISOString()
          : null)
      : null;

  return { bars, latestBarIso };
}

export function radarChartIntervalLabel(interval: RadarChartInterval | null): string {
  if (interval === "5m") return "INTRADAY · 5-MIN BARS · 15-MIN DELAYED";
  if (interval === "1m") return "INTRADAY · 1-MIN BARS · 15-MIN DELAYED";
  return "INTRADAY · 15-MIN DELAYED";
}

export function radarChartEmptyCopy(status: "empty" | "error" | "unsupported"): string {
  if (status === "error") return "Intraday chart temporarily unavailable.";
  if (status === "unsupported") return "Intraday chart unavailable for this data source.";
  return "No intraday bars available for this session.";
}
