import { getAggregates } from "@/lib/polygon";
import {
  intradayFallbackSessionDates,
  resolveChartAggregateRequest,
  type ChartAggregateRequest,
} from "./chart-ranges";
import { normalizeAggregateBars, type NormalizedBar } from "./normalize-bars";

export interface ChartAggregateResult {
  request: ChartAggregateRequest;
  bars: NormalizedBar[];
  usesPriorSessionFallback: boolean;
}

export async function fetchChartAggregateBars(
  ticker: string,
  rangeId: string,
  now = new Date(),
): Promise<ChartAggregateResult> {
  const request = resolveChartAggregateRequest(rangeId, now);
  let usesPriorSessionFallback = false;

  const load = async (from: string, to: string) => {
    const payload = await getAggregates(ticker, request.multiplier, request.timespan, from, to);
    const raw =
      Array.isArray(payload)
        ? payload
        : payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results)
          ? (payload as { results: unknown[] }).results
          : payload;
    return normalizeAggregateBars(raw);
  };

  let bars = await load(request.from, request.to);

  if (request.granularity === "intraday" && request.rangeId === "1D" && bars.length === 0) {
    for (const sessionDate of intradayFallbackSessionDates(now).slice(1)) {
      bars = await load(sessionDate, sessionDate);
      if (bars.length > 0) {
        usesPriorSessionFallback = true;
        break;
      }
    }
  }

  return { request, bars, usesPriorSessionFallback };
}
