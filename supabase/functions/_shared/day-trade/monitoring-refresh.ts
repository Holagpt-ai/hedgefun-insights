import {
  DAY_TRADE_MONITORING_REFRESH_BATCH_SIZE,
} from "./qualification-lifecycle.config.ts";
import type { PolygonTicker } from "../screeners/selection.ts";
import { normalizeSymbol } from "../screeners/selection.ts";
import type { DayTradeMetricsRow } from "./evaluate-five-pillars.ts";
import { mapPolygonToDayTradeMetrics } from "./map-polygon-metrics.ts";
import {
  loadQualificationStatesForSession,
  type QualificationDb,
} from "./persist-qualification-lifecycle.ts";
import { isDayTradeQualificationMonitoringCandidate } from "./qualification-lifecycle.ts";

export function selectMonitoringRefreshSymbols(
  existing: Map<string, { symbol: string; monitoringEligible: boolean; everOnDesk: boolean; currentlyOnDesk: boolean }>,
  metricsPresent: Set<string>,
  limit = DAY_TRADE_MONITORING_REFRESH_BATCH_SIZE,
): string[] {
  const out: string[] = [];
  for (const [symbol, state] of existing) {
    if (metricsPresent.has(symbol)) continue;
    if (!isDayTradeQualificationMonitoringCandidate(state as never)) continue;
    out.push(symbol);
    if (out.length >= limit) break;
  }
  return out;
}

export function metricsRowsForMonitoringRefresh(input: {
  symbols: readonly string[];
  allTickers: readonly PolygonTicker[];
}): DayTradeMetricsRow[] {
  const bySymbol = new Map<string, PolygonTicker>();
  for (const ticker of input.allTickers) {
    const sym = normalizeSymbol(ticker.ticker);
    if (sym) bySymbol.set(sym, ticker);
  }
  const rows: DayTradeMetricsRow[] = [];
  for (const symbol of input.symbols) {
    const ticker = bySymbol.get(symbol.trim().toUpperCase());
    if (!ticker) continue;
    const mapped = mapPolygonToDayTradeMetrics({ ticker });
    if (mapped) rows.push(mapped);
  }
  return rows;
}

export async function listMonitoringRefreshSymbols(
  db: QualificationDb,
  sessionDate: string,
  metricsPresent: Set<string>,
): Promise<string[]> {
  const existing = await loadQualificationStatesForSession(db, sessionDate);
  return selectMonitoringRefreshSymbols(existing, metricsPresent);
}
