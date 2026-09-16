import { easternDate } from "@/lib/radar-v22";
import { normalizeChartBarTime } from "./chart-time";
import type { RadarChartBar } from "./types";

export type RadarChartInterval = "1m" | "5m";

export function radarChartSessionDate(
  providerAsOfMax: string | null | undefined,
  nowMs: number = Date.now(),
): string {
  const ms = providerAsOfMax ? Date.parse(providerAsOfMax) : Number.NaN;
  return easternDate(Number.isFinite(ms) ? ms : nowMs);
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
