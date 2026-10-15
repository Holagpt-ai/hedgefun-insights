import type { RadarV22CandidateRow } from "../radar-v22/persistence-v2.ts";
import {
  advanceDayTradeQualificationLifecycle,
  loadQualificationStatesForSession,
  type QualificationDb,
} from "./persist-qualification-lifecycle.ts";
import { loadLatestScreenerFloatSharesBySymbol } from "./load-screener-float-shares.ts";
import { mapV22CandidateToDayTradeMetrics } from "./map-v22-metrics.ts";
import { isDayTradeQualificationMonitoringCandidate } from "./qualification-lifecycle.ts";

export async function captureDayTradeQualificationFromV22(input: {
  db: QualificationDb;
  sessionDate: string;
  generationId: string;
  candidates: readonly RadarV22CandidateRow[];
}): Promise<void> {
  const symbols = input.candidates.map((row) => row.symbol);
  const floatBySymbol = await loadLatestScreenerFloatSharesBySymbol(input.db, symbols);
  const metricsRows = input.candidates.map((row) =>
    mapV22CandidateToDayTradeMetrics(
      row,
      floatBySymbol.get(row.symbol.trim().toUpperCase()) ?? null,
    )
  );
  const present = new Set(metricsRows.map((r) => r.symbol));

  const existing = await loadQualificationStatesForSession(input.db, input.sessionDate);
  const watchSymbols: string[] = [];
  for (const [symbol, state] of existing) {
    if (present.has(symbol)) continue;
    if (isDayTradeQualificationMonitoringCandidate(state)) watchSymbols.push(symbol);
  }

  await advanceDayTradeQualificationLifecycle({
    db: input.db,
    sessionDate: input.sessionDate,
    syncRunId: input.generationId,
    metricsRows,
    watchSymbols,
    deskGenerationComplete: true,
  });
}
