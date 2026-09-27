import type { AiTraderObservation } from "@/lib/ai-trader/domain/memory";
import type { MarketCandidate } from "@/lib/ai-trader/market/candidate";
import { candidateObservedAt } from "@/lib/ai-trader/runtime/freshness";
import type { AiTraderMarketSession } from "@/lib/ai-trader/runtime/contracts";

function observation(
  candidate: MarketCandidate,
  observedAt: string,
  observationType: string,
  value: Record<string, unknown>,
  sourceEventKey: string,
): AiTraderObservation {
  return {
    kind: "OBSERVATION",
    id: sourceEventKey,
    instrument: {
      symbol: candidate.symbol,
      assetClass: candidate.assetClass,
      venue: null,
    },
    observedAt,
    observationType,
    value,
    provenance: {
      source: candidate.source,
      sourceType: candidate.provenance.table,
      sourceId: candidate.provenance.generationId ?? candidate.symbol,
      sourceTimestamp: observedAt,
      retrievedAt: observedAt,
      verificationState: "PROVIDER_REPORTED",
    },
    qualityScore: null,
  };
}

/** Persist only real values. Null is never stored as zero. */
export function buildRealObservations(
  candidate: MarketCandidate,
  session: AiTraderMarketSession,
): readonly AiTraderObservation[] {
  const observedAt = candidateObservedAt(candidate);
  if (!observedAt) return [];
  const rows: AiTraderObservation[] = [];
  const key = (type: string) =>
    `obs:${candidate.symbol}:${type}:${observedAt}:${candidate.provenance.generationId ?? "nogeneration"}`;
  if (Number.isInteger(candidate.sourceRank) && candidate.sourceRank >= 1) {
    rows.push(observation(candidate, observedAt, "RADAR_RANK", { sourceRank: candidate.sourceRank }, key("RADAR_RANK")));
  }
  if (candidate.lastPrice != null && Number.isFinite(candidate.lastPrice)) {
    rows.push(observation(candidate, observedAt, "LAST_PRICE", { lastPrice: candidate.lastPrice }, key("LAST_PRICE")));
  }
  if (candidate.volume != null && Number.isFinite(candidate.volume)) {
    rows.push(observation(candidate, observedAt, "VOLUME", { volume: candidate.volume }, key("VOLUME")));
  }
  rows.push(observation(candidate, observedAt, "SESSION_STATE", { session }, key("SESSION_STATE")));
  for (const catalyst of candidate.catalystRefs) {
    if (!catalyst.eventType) continue;
    rows.push(
      observation(
        candidate,
        observedAt,
        "CATALYST_REF",
        { eventType: catalyst.eventType, verificationState: catalyst.verificationState },
        `${key("CATALYST_REF")}:${catalyst.id ?? catalyst.eventType}`,
      ),
    );
  }
  return rows;
}

export function observationSourceEventKey(observationRow: AiTraderObservation): string {
  return observationRow.id;
}
