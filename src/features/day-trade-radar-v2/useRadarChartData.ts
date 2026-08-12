import { useEffect, useRef, useState } from "react";
import { getAggregates } from "@/lib/polygon";
import { normalizeChartBarTime } from "./chart-time";
import type { RadarChartBar, RadarChartStatus } from "./types";

function sessionDateKey(iso: string | null | undefined): string {
  if (iso) {
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) {
      return new Date(ms).toISOString().slice(0, 10);
    }
  }
  return new Date().toISOString().slice(0, 10);
}

function cacheKey(symbol: string, sessionDate: string): string {
  return `${symbol}::${sessionDate}`;
}

type CacheEntry = {
  bars: RadarChartBar[];
  latestBarIso: string | null;
};

const chartCache = new Map<string, CacheEntry>();

function mapAggregates(payload: unknown): {
  bars: RadarChartBar[];
  latestBarIso: string | null;
} {
  const results =
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { results?: unknown }).results)
      ? ((payload as { results: unknown[] }).results)
      : [];

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

    // Polygon aggregates use `t` (ms epoch). Prefer that over collapsing dates.
    const timeRaw =
      r.t ??
      (typeof r.timestamp === "string" || typeof r.timestamp === "number"
        ? r.timestamp
        : null);
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

/**
 * Fetch real 1-minute aggregates for the selected accessible ticker.
 * Race-safe: only the latest request updates state.
 */
export function useRadarChartData(opts: {
  symbol: string | null;
  enabled: boolean;
  providerAsOfMax: string | null;
}) {
  const { symbol, enabled, providerAsOfMax } = opts;
  const [status, setStatus] = useState<RadarChartStatus>("idle");
  const [bars, setBars] = useState<RadarChartBar[]>([]);
  const [latestBarIso, setLatestBarIso] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled || !symbol) {
      setStatus("idle");
      setBars([]);
      setLatestBarIso(null);
      setErrorMessage(null);
      return;
    }

    const sessionDate = sessionDateKey(providerAsOfMax);
    const key = cacheKey(symbol, sessionDate);
    const cached = chartCache.get(key);
    if (cached) {
      setBars(cached.bars);
      setLatestBarIso(cached.latestBarIso);
      setStatus(cached.bars.length > 0 ? "available" : "empty");
      setErrorMessage(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setStatus("loading");
    setErrorMessage(null);

    void (async () => {
      try {
        const payload = await getAggregates(symbol, 1, "minute", sessionDate, sessionDate);
        if (requestId !== requestIdRef.current) return;
        const mapped = mapAggregates(payload);
        chartCache.set(key, mapped);
        setBars(mapped.bars);
        setLatestBarIso(mapped.latestBarIso);
        setStatus(mapped.bars.length > 0 ? "available" : "empty");
      } catch {
        if (requestId !== requestIdRef.current) return;
        setBars([]);
        setLatestBarIso(null);
        setStatus("error");
        setErrorMessage("Chart data unavailable");
      }
    })();
  }, [symbol, enabled, providerAsOfMax]);

  return { status, bars, latestBarIso, errorMessage };
}

/** Test helper — clear in-memory chart cache between tests. */
export function __clearRadarChartCacheForTests(): void {
  chartCache.clear();
}
