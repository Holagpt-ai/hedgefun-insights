/**
 * Ingestion boundary for historical corporate_events (V1).
 * Does not fetch external news — defines the contract for a future adapter job.
 */

import type { CatalystCorporateEventDraft } from "@/lib/episode-event-linkage/map-catalyst-to-corporate-event";

export interface CorporateEventIngestionBatchResult {
  applied: number;
  skippedDuplicate: number;
  skippedInvalid: number;
}

export interface CorporateEventIngestionWriter {
  applyCorporateEventDrafts(
    drafts: readonly CatalystCorporateEventDraft[],
  ): Promise<CorporateEventIngestionBatchResult>;
}

/**
 * Production today: `catalyst_events` is populated by sync-catalyst-events / SEC sync (symbol keyed).
 * Historical memory requires security_id resolution + batch apply via corporate_event_apply_batch.
 */
export const EPISODE_EVENT_LINKAGE_INGESTION_GAPS = [
  "No automated job yet maps catalyst_events.symbol → securities.security_id → corporate_events.",
  "No batch linker job persists event_reaction_links for historical market_behavior_episodes.",
] as const;
