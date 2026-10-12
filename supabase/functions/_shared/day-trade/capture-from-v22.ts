import type { RadarV22CandidateRow } from "../radar-v22/persistence-v2.ts";
import { advanceDayTradeQualificationLifecycle } from "./persist-qualification-lifecycle.ts";
import type { QualificationDb } from "./persist-qualification-lifecycle.ts";
import { mapV22CandidateToDayTradeMetrics } from "./map-v22-metrics.ts";

export async function captureDayTradeQualificationFromV22(input: {
  db: QualificationDb;
  sessionDate: string;
  generationId: string;
  nowMs: number;
  candidates: readonly RadarV22CandidateRow[];
}): Promise<void> {
  const metricsRows = input.candidates.map((row) => mapV22CandidateToDayTradeMetrics(row));
  await advanceDayTradeQualificationLifecycle({
    db: input.db,
    sessionDate: input.sessionDate,
    syncRunId: input.generationId,
    nowMs: input.nowMs,
    metricsRows,
    evaluable: true,
  });
}
