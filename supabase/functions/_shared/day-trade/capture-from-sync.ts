import type { PolygonTicker } from "../screeners/selection.ts";
import { normalizeSymbol } from "../screeners/selection.ts";
import type { VolumeBaselineQuote } from "../screeners/volume-baseline.ts";
import { advanceDayTradeQualificationLifecycle } from "./persist-qualification-lifecycle.ts";
import type { QualificationDb } from "./persist-qualification-lifecycle.ts";
import { mapPolygonToDayTradeMetrics } from "./map-polygon-metrics.ts";

export async function captureDayTradeQualificationFromSync(input: {
  db: QualificationDb;
  sessionDate: string;
  syncRunId: string;
  nowMs: number;
  dayTradeSymbols: readonly string[];
  allTickers: readonly PolygonTicker[];
  volumeBaselines: ReadonlyMap<string, VolumeBaselineQuote>;
}): Promise<void> {
  const bySymbol = new Map<string, PolygonTicker>();
  for (const ticker of input.allTickers) {
    const sym = normalizeSymbol(ticker.ticker);
    if (sym) bySymbol.set(sym, ticker);
  }

  const metricsRows = [];
  for (const raw of input.dayTradeSymbols) {
    const symbol = raw.trim().toUpperCase();
    const ticker = bySymbol.get(symbol);
    if (!ticker) continue;
    const baseline = input.volumeBaselines.get(symbol);
    const mapped = mapPolygonToDayTradeMetrics({
      ticker,
      rvol20d: baseline?.rvol_20d ?? null,
      avgVolume20d: baseline?.avg_volume_20d ?? null,
    });
    if (mapped) metricsRows.push(mapped);
  }

  await advanceDayTradeQualificationLifecycle({
    db: input.db,
    sessionDate: input.sessionDate,
    syncRunId: input.syncRunId,
    nowMs: input.nowMs,
    metricsRows,
    evaluable: true,
  });
}
