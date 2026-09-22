/**
 * Catalyst → corporate_events adapter (bridge only).
 */

import {
  adaptCatalystRowsToCorporateEvents,
  type CatalystFeedRow,
} from "@/lib/episode-event-linkage/catalyst-corporate-event-adapter";
import { applyCorporateEventBatch } from "@/lib/episode-event-linkage/bridge-catalyst-corporate-batch";
import {
  fetchAllCatalystEvents,
  loadSecurityIdentityStoreFromBridge,
} from "@/lib/episode-event-linkage/load-bridge-identity-store";
import { HistoricalBridgeClient, requireHistoricalBridgeConfig } from "@/lib/persistence/historical-bridge-client";
import type { CatalystEventType } from "@/types/catalyst";

const APPLY_BATCH_SIZE = Number(process.env.CATALYST_ADAPTER_BATCH_SIZE ?? 50);
const MAX_SOURCE_ROWS = Number(process.env.CATALYST_ADAPTER_MAX_ROWS ?? 500_000);

function mapCatalystFeedRow(row: Record<string, unknown>): CatalystFeedRow | null {
  const dedupeKey = typeof row.dedupe_key === "string" ? row.dedupe_key : null;
  const symbol = typeof row.symbol === "string" ? row.symbol : null;
  const eventType = typeof row.event_type === "string" ? row.event_type : null;
  if (!dedupeKey || !symbol || !eventType) return null;
  return {
    dedupe_key: dedupeKey,
    symbol,
    event_type: eventType as CatalystEventType,
    event_date: typeof row.event_date === "string" ? row.event_date : null,
    event_time: typeof row.event_time === "string" ? row.event_time : null,
    title: typeof row.title === "string" ? row.title : null,
    description: typeof row.description === "string" ? row.description : null,
    source_name: typeof row.source_name === "string" ? row.source_name : "unknown",
    source_url: typeof row.source_url === "string" ? row.source_url : null,
    provider: typeof row.provider === "string" ? row.provider : "unknown",
    provider_article_id: typeof row.provider_article_id === "string" ? row.provider_article_id : null,
    published_at: typeof row.published_at === "string" ? row.published_at : null,
    facts: row.facts && typeof row.facts === "object" && !Array.isArray(row.facts)
      ? row.facts as Record<string, unknown>
      : null,
  };
}

async function main() {
  const bridge = new HistoricalBridgeClient(requireHistoricalBridgeConfig());
  const ingestedAt = new Date().toISOString();

  const [identityStore, sourceRows] = await Promise.all([
    loadSecurityIdentityStoreFromBridge(bridge),
    fetchAllCatalystEvents(bridge),
  ]);

  const capped = sourceRows.slice(0, MAX_SOURCE_ROWS);
  const feedRows = capped.map(mapCatalystFeedRow).filter((row): row is CatalystFeedRow => row != null);

  const adapted = adaptCatalystRowsToCorporateEvents({
    rows: feedRows,
    store: identityStore,
    ingestedAt,
  });

  let applied = 0;
  for (let i = 0; i < adapted.corporateEvents.length; i += APPLY_BATCH_SIZE) {
    const chunk = adapted.corporateEvents.slice(i, i + APPLY_BATCH_SIZE);
    applied += await applyCorporateEventBatch(bridge, chunk);
  }

  const unresolvedByReason = new Map<string, number>();
  for (const row of adapted.unresolved) {
    unresolvedByReason.set(row.reason, (unresolvedByReason.get(row.reason) ?? 0) + 1);
  }
  const skipsByReason = new Map<string, number>();
  for (const row of adapted.skips) {
    skipsByReason.set(row.reason, (skipsByReason.get(row.reason) ?? 0) + 1);
  }

  console.log(JSON.stringify({
    msg: "catalyst_corporate_adapter_complete",
    source_rows_examined: capped.length,
    feed_rows_parsed: feedRows.length,
    identities_resolved: adapted.mapped,
    unresolved_identities: adapted.unresolved.length,
    unresolved_by_reason: Object.fromEntries(unresolvedByReason),
    corporate_events_mapped: adapted.mapped,
    rows_applied: applied,
    skips: adapted.skips.length,
    skips_by_reason: Object.fromEntries(skipsByReason),
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({ msg: "catalyst_corporate_adapter_failed", error: String(error) }));
  process.exit(1);
});
