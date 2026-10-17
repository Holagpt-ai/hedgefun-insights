import { fmtEtDate, previousTradingDay } from "./calendar";

export type ChartGranularity = "intraday" | "daily" | "weekly";

export interface ChartAggregateRequest {
  from: string;
  to: string;
  multiplier: number;
  timespan: "minute" | "hour" | "day" | "week" | "month";
  granularity: ChartGranularity;
  /** Human timeframe id (1D, 5D, 1W, …). */
  rangeId: string;
}

function shiftCalendarDays(now: Date, days: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() + days);
  return fmtEtDate(d);
}

/**
 * Resolve Polygon aggregate params for stock detail / chart pages.
 * Intraday labels (1D, 5D, 1W) request minute/hour bars — never daily bars.
 */
export function resolveChartAggregateRequest(
  rangeId: string,
  now = new Date(),
): ChartAggregateRequest {
  const to = fmtEtDate(now);

  switch (rangeId) {
    case "1D":
      return {
        rangeId,
        from: to,
        to,
        multiplier: 5,
        timespan: "minute",
        granularity: "intraday",
      };
    case "5D": {
      const from = shiftCalendarDays(now, -7);
      return {
        rangeId,
        from,
        to,
        multiplier: 15,
        timespan: "minute",
        granularity: "intraday",
      };
    }
    case "1W": {
      const from = shiftCalendarDays(now, -7);
      return {
        rangeId,
        from,
        to,
        multiplier: 30,
        timespan: "minute",
        granularity: "intraday",
      };
    }
    case "1M": {
      const from = shiftCalendarDays(now, -30);
      return {
        rangeId,
        from,
        to,
        multiplier: 1,
        timespan: "hour",
        granularity: "intraday",
      };
    }
    case "3M": {
      const from = shiftCalendarDays(now, -90);
      return { rangeId, from, to, multiplier: 1, timespan: "day", granularity: "daily" };
    }
    case "6M": {
      const from = shiftCalendarDays(now, -180);
      return { rangeId, from, to, multiplier: 1, timespan: "day", granularity: "daily" };
    }
    case "YTD": {
      const from = `${now.getFullYear()}-01-01`;
      return { rangeId, from, to, multiplier: 1, timespan: "day", granularity: "daily" };
    }
    case "1Y": {
      const from = shiftCalendarDays(now, -365);
      return { rangeId, from, to, multiplier: 1, timespan: "day", granularity: "daily" };
    }
    case "5Y": {
      const from = shiftCalendarDays(now, -365 * 5);
      return { rangeId, from, to, multiplier: 1, timespan: "week", granularity: "weekly" };
    }
    case "MAX":
      return {
        rangeId,
        from: "2000-01-01",
        to,
        multiplier: 1,
        timespan: "month",
        granularity: "daily",
      };
    default: {
      const from = shiftCalendarDays(now, -30);
      return { rangeId, from, to, multiplier: 1, timespan: "day", granularity: "daily" };
    }
  }
}

/** When today's intraday window is empty, walk back to the latest session date. */
export function intradayFallbackSessionDates(now: Date, maxDaysBack = 4): string[] {
  const dates: string[] = [];
  let cursor = fmtEtDate(now);
  dates.push(cursor);
  for (let i = 0; i < maxDaysBack; i++) {
    cursor = previousTradingDay(cursor).date;
    dates.push(cursor);
  }
  return dates;
}
