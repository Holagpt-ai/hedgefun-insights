import { useEffect, useRef, useState } from "react";
import { getAggregates } from "@/lib/polygon";
import {
  mapAggregates,
  radarChartSessionDate,
  type RadarChartInterval,
} from "./radar-chart-data";
import type { RadarChartBar, RadarChartStatus } from "./types";

function cacheKey(symbol: string, sessionDate: string, interval: RadarChartInterval): string {
  return `${symbol}::${sessionDate}::${interval}`;
}

type CacheEntry = {
  bars: RadarChartBar[];
  latestBarIso: string | null;
  interval: RadarChartInterval;
};

const chartCache = new Map<string, CacheEntry>();

/**
 * Fetch real intraday aggregates for the selected accessible ticker.
 * Race-safe: only the latest request updates state.
 * 1-minute first; 5-minute fallback only after a successful empty 1-minute payload.
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
  const [interval, setInterval] = useState<RadarChartInterval | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!enabled || !symbol) {
      setStatus("idle");
      setBars([]);
      setLatestBarIso(null);
      setErrorMessage(null);
      setInterval(null);
      return;
    }

    const sessionDate = radarChartSessionDate(providerAsOfMax);
    const minuteKey = cacheKey(symbol, sessionDate, "1m");
    const fiveKey = cacheKey(symbol, sessionDate, "5m");
    const cached = chartCache.get(minuteKey) ?? chartCache.get(fiveKey);
    if (cached) {
      setBars(cached.bars);
      setLatestBarIso(cached.latestBarIso);
      setInterval(cached.interval);
      setStatus(cached.bars.length > 0 ? "available" : "empty");
      setErrorMessage(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setStatus("loading");
    setErrorMessage(null);

    void (async () => {
      try {
        const minutePayload = await getAggregates(symbol, 1, "minute", sessionDate, sessionDate);
        if (requestId !== requestIdRef.current) return;
        const minuteMapped = mapAggregates(minutePayload);
        if (minuteMapped.bars.length > 0) {
          chartCache.set(minuteKey, { ...minuteMapped, interval: "1m" });
          setBars(minuteMapped.bars);
          setLatestBarIso(minuteMapped.latestBarIso);
          setInterval("1m");
          setStatus("available");
          return;
        }

        const fivePayload = await getAggregates(symbol, 5, "minute", sessionDate, sessionDate);
        if (requestId !== requestIdRef.current) return;
        const fiveMapped = mapAggregates(fivePayload);
        const used = fiveMapped.bars.length > 0 ? fiveMapped : minuteMapped;
        const usedInterval: RadarChartInterval = fiveMapped.bars.length > 0 ? "5m" : "1m";
        chartCache.set(cacheKey(symbol, sessionDate, usedInterval), {
          ...used,
          interval: usedInterval,
        });
        setBars(used.bars);
        setLatestBarIso(used.latestBarIso);
        setInterval(usedInterval);
        setStatus(used.bars.length > 0 ? "available" : "empty");
      } catch {
        if (requestId !== requestIdRef.current) return;
        setBars([]);
        setLatestBarIso(null);
        setInterval(null);
        setStatus("error");
        setErrorMessage("Intraday chart temporarily unavailable.");
      }
    })();
  }, [symbol, enabled, providerAsOfMax]);

  return { status, bars, latestBarIso, errorMessage, interval };
}

/** Test helper — clear in-memory chart cache between tests. */
export function __clearRadarChartCacheForTests(): void {
  chartCache.clear();
}
