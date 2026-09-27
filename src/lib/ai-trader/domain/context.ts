import type { AiTraderOperatingMode } from "@/lib/ai-trader/operating-mode";
import type { ContextSnapshotId, AiTraderSessionId } from "@/lib/ai-trader/domain/ids";
import { stableJsonHash } from "@/lib/ai-trader/domain/ids";
import type { AiTraderInstrument } from "@/lib/ai-trader/domain/instrument";

export const AI_TRADER_CONTEXT_SCHEMA_VERSION = "v1";

export interface ContextProvenanceRef {
  sourceType: string;
  sourceId: string;
  source: string | null;
  sourceTimestamp: string | null;
  retrievedAt: string;
  verificationState: string;
}

/** Immutable picture of what was known at a decision. Append-only. */
export interface AiTraderContextSnapshot {
  id: ContextSnapshotId;
  tradingSessionId: AiTraderSessionId | null;
  instrument: AiTraderInstrument;
  observedAt: string;
  marketSession: string;
  operatingMode: AiTraderOperatingMode;
  quoteTimestamp: string | null;
  marketState: Record<string, unknown>;
  stocksistSignals: Record<string, unknown>;
  catalystRefs: readonly ContextProvenanceRef[];
  historicalRefs: readonly ContextProvenanceRef[];
  sourceProvenance: readonly ContextProvenanceRef[];
  contextHash: string;
  schemaVersion: string;
}

export function contextSnapshotPayload(snapshot: Omit<AiTraderContextSnapshot, "id" | "contextHash">): Record<string, unknown> {
  return {
    tradingSessionId: snapshot.tradingSessionId,
    instrument: snapshot.instrument,
    observedAt: snapshot.observedAt,
    marketSession: snapshot.marketSession,
    operatingMode: snapshot.operatingMode,
    quoteTimestamp: snapshot.quoteTimestamp,
    marketState: snapshot.marketState,
    stocksistSignals: snapshot.stocksistSignals,
    catalystRefs: snapshot.catalystRefs,
    historicalRefs: snapshot.historicalRefs,
    sourceProvenance: snapshot.sourceProvenance,
    schemaVersion: snapshot.schemaVersion,
  };
}

export function hashContextSnapshot(
  snapshot: Omit<AiTraderContextSnapshot, "id" | "contextHash">,
): string {
  return stableJsonHash(contextSnapshotPayload(snapshot));
}
