/**
 * Catalyst Identity Coverage Expansion V1 — bridge only.
 */

import { analyzeCatalystUnresolvedSymbols } from "@/lib/episode-event-linkage/analyze-catalyst-unresolved";
import {
  applyCatalystIdentityExpansion,
  selectCatalystIdentityExpansionCandidates,
} from "@/lib/episode-event-linkage/expand-catalyst-identity-coverage";
import type { CatalystFeedRow } from "@/lib/episode-event-linkage/catalyst-corporate-event-adapter";
import {
  fetchAllCatalystEvents,
  fetchAllEligibleTickers,
  loadSecurityIdentityStoreFromBridge,
} from "@/lib/episode-event-linkage/load-bridge-identity-store";
import { HistoricalBridgeClient, requireHistoricalBridgeConfig } from "@/lib/persistence/historical-bridge-client";
import type { CatalystEventType } from "@/types/catalyst";

const MAX_CANDIDATES = Number(process.env.CATALYST_IDENTITY_EXPAND_MAX ?? 8000);

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
  const recordedAt = new Date().toISOString();

  const [storeBefore, catalystRaw, eligibleTickers] = await Promise.all([
    loadSecurityIdentityStoreFromBridge(bridge),
    fetchAllCatalystEvents(bridge),
    fetchAllEligibleTickers(bridge),
  ]);
  const feedRows = catalystRaw.map(mapCatalystFeedRow).filter((row): row is CatalystFeedRow => row != null);

  const analysisBefore = analyzeCatalystUnresolvedSymbols({
    rows: feedRows,
    store: storeBefore,
    eligibleTickers,
  });

  const candidates = selectCatalystIdentityExpansionCandidates({
    unresolvedSymbols: analysisBefore.bySymbol.map((row) => ({
      symbol: row.symbol,
      classification: row.classification,
      earliestEventDate: row.earliestEventDate,
      rowCount: row.rowCount,
    })),
    eligibleTickers,
    maxCandidates: MAX_CANDIDATES,
  });

  const expansion = await applyCatalystIdentityExpansion({
    bridge,
    candidates,
    recordedAt,
  });

  const storeAfter = await loadSecurityIdentityStoreFromBridge(bridge);
  const analysisAfter = analyzeCatalystUnresolvedSymbols({
    rows: feedRows,
    store: storeAfter,
    eligibleTickers,
  });

  console.log(JSON.stringify({
    msg: "catalyst_identity_coverage_expand_complete",
    identity_snapshot_before: {
      securities: storeBefore.listSecurities().length,
      history_rows: storeBefore.listHistory().length,
      identifiers: storeBefore.listIdentifiers().length,
      eligible_tickers: eligibleTickers.length,
    },
    identity_snapshot_after: {
      securities: storeAfter.listSecurities().length,
      history_rows: storeAfter.listHistory().length,
      identifiers: storeAfter.listIdentifiers().length,
    },
    analysis_before: {
      total_rows: analysisBefore.totalRows,
      resolved_rows: analysisBefore.resolvedRows,
      unresolved_rows: analysisBefore.unresolvedRows,
      unique_unresolved_symbols: analysisBefore.uniqueUnresolvedSymbols,
      unresolved_reason_counts: analysisBefore.unresolvedReasonCounts,
      classification_counts: analysisBefore.classificationCounts,
      top_unresolved_symbols: analysisBefore.bySymbol.slice(0, 15),
    },
    expansion,
    analysis_after: {
      total_rows: analysisAfter.totalRows,
      resolved_rows: analysisAfter.resolvedRows,
      unresolved_rows: analysisAfter.unresolvedRows,
      unique_unresolved_symbols: analysisAfter.uniqueUnresolvedSymbols,
      unresolved_reason_counts: analysisAfter.unresolvedReasonCounts,
      classification_counts: analysisAfter.classificationCounts,
      newly_resolved_rows: analysisAfter.resolvedRows - analysisBefore.resolvedRows,
    },
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({ msg: "catalyst_identity_coverage_expand_failed", error: String(error) }));
  process.exit(1);
});
