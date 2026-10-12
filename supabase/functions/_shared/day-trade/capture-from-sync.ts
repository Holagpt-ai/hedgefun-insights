import type { PolygonTicker } from "../screeners/selection.ts";
import type { VolumeBaselineQuote } from "../screeners/volume-baseline.ts";
import {
  advanceDayTradeQualificationLifecycle,
  type QualificationDb,
} from "./persist-qualification-lifecycle.ts";
import { mapPolygonToDayTradeMetrics } from "./map-polygon-metrics.ts";
import {
  listMonitoringRefreshSymbols,
  metricsRowsForMonitoringRefresh,
} from "./monitoring-refresh.ts";

export async function captureDayTradeQualificationFromSync(input: {
  db: QualificationDb;
  sessionDate: string;
  syncRunId: string;
  dayTradeSymbols: readonly string[];
  allTickers: readonly PolygonTicker[];
  volumeBaselines: ReadonlyMap<string, VolumeBaselineQuote>;
}): Promise<void> {
  const bySymbol = new Map<string, PolygonTicker>();
  for (const ticker of input.allTickers) {
    const sym = typeof ticker.ticker === "string" ? ticker.ticker.trim().toUpperCase() : "";
    if (sym) bySymbol.set(sym, ticker);
  }

  const metricsRows = [];
  const metricsPresent = new Set<string>();
  for (const raw of input.dayTradeSymbols) {
    const symbol = raw.trim().toUpperCase();
    const ticker = bySymbol.get(symbol);
    if (!ticker) continue;
    const baseline = input.volumeBaselines.get(symbol);
    const sessionVol = typeof ticker.day?.v === "number" ? ticker.day.v : null;
    const avg20 = baseline?.avg_volume_20d ?? null;
    const rvol20d =
      sessionVol !== null && avg20 !== null && avg20 > 0
        ? sessionVol / avg20
        : null;
    const mapped = mapPolygonToDayTradeMetrics({
      ticker,
      rvol20d,
      avgVolume20d: avg20,
    });
    if (mapped) {
      metricsRows.push(mapped);
      metricsPresent.add(symbol);
    }
  }

  const refreshSymbols = await listMonitoringRefreshSymbols(
    input.db,
    input.sessionDate,
    metricsPresent,
  );
  metricsRows.push(
    ...metricsRowsForMonitoringRefresh({
      symbols: refreshSymbols,
      allTickers: input.allTickers,
    }),
  );

  await advanceDayTradeQualificationLifecycle({
    db: input.db,
    sessionDate: input.sessionDate,
    syncRunId: input.syncRunId,
    metricsRows,
  });
}
