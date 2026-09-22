/**
 * Episode ↔ corporate event linker (bridge only).
 */

import { applyEventReactionLinkBatch } from "@/lib/episode-event-linkage/bridge-catalyst-corporate-batch";
import { corporateEventFromRow } from "@/lib/episode-event-linkage/corporate-event-record";
import { linkEpisodesForSecurityWithAudit } from "@/lib/episode-event-linkage/episode-event-linker";
import { HistoricalBridgeClient, requireHistoricalBridgeConfig } from "@/lib/persistence/historical-bridge-client";
import type { MarketBehaviorEpisode, SecurityDailyHistory } from "@/types/security-intelligence";
import type { SecurityId } from "@/types/security-identity";

const LINK_BATCH_SIZE = Number(process.env.EPISODE_LINK_BATCH_SIZE ?? 50);
const CANDIDATE_PAGE = Number(process.env.EPISODE_LINK_CANDIDATE_PAGE ?? 500);

function mapEpisode(row: Record<string, unknown>): MarketBehaviorEpisode {
  return {
    episodeId: String(row.episode_id),
    securityId: String(row.security_id),
    episodeStart: String(row.episode_start),
    episodeEnd: typeof row.episode_end === "string" ? row.episode_end : null,
    observedSymbol: typeof row.observed_symbol === "string" ? row.observed_symbol : null,
    direction: row.direction as MarketBehaviorEpisode["direction"],
    tier: row.tier as MarketBehaviorEpisode["tier"],
    startPrice: row.start_price === null ? null : Number(row.start_price),
    highPrice: row.high_price === null ? null : Number(row.high_price),
    lowPrice: row.low_price === null ? null : Number(row.low_price),
    endPrice: row.end_price === null ? null : Number(row.end_price),
    maxPositiveMovePct: row.max_positive_move_pct === null ? null : Number(row.max_positive_move_pct),
    maxNegativeMovePct: row.max_negative_move_pct === null ? null : Number(row.max_negative_move_pct),
    volume: row.volume === null ? null : Number(row.volume),
    dollarVolume: row.dollar_volume === null ? null : Number(row.dollar_volume),
    rvol: row.rvol === null ? null : Number(row.rvol),
    floatTurnover: row.float_turnover === null ? null : Number(row.float_turnover),
    haltCount: row.halt_count === null ? null : Number(row.halt_count),
    closeStrength: row.close_strength === null ? null : Number(row.close_strength),
    detectedBy: typeof row.detected_by === "string" ? row.detected_by : null,
    origin: row.origin as MarketBehaviorEpisode["origin"],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    source: typeof row.source === "string" ? row.source : null,
    sourceAsOf: typeof row.source_as_of === "string" ? row.source_as_of : null,
    fetchedAt: typeof row.fetched_at === "string" ? row.fetched_at : null,
    computedAt: typeof row.computed_at === "string" ? row.computed_at : null,
    quality: row.quality as MarketBehaviorEpisode["quality"],
    freshness: row.freshness as MarketBehaviorEpisode["freshness"],
    provenance: row.provenance as MarketBehaviorEpisode["provenance"],
  };
}

function mapDaily(row: Record<string, unknown>): SecurityDailyHistory {
  return {
    securityId: String(row.security_id),
    sessionDate: String(row.session_date).slice(0, 10),
    observedSymbol: typeof row.observed_symbol === "string" ? row.observed_symbol : null,
    exchange: typeof row.exchange === "string" ? row.exchange : null,
    open: row.open === null ? null : Number(row.open),
    high: row.high === null ? null : Number(row.high),
    low: row.low === null ? null : Number(row.low),
    close: row.close === null ? null : Number(row.close),
    volume: row.volume === null ? null : Number(row.volume),
    dollarVolume: row.dollar_volume === null ? null : Number(row.dollar_volume),
    previousClose: row.previous_close === null ? null : Number(row.previous_close),
    movePct: row.move_pct === null ? null : Number(row.move_pct),
    source: typeof row.source === "string" ? row.source : null,
    sourceAsOf: typeof row.source_as_of === "string" ? row.source_as_of : null,
    fetchedAt: typeof row.fetched_at === "string" ? row.fetched_at : null,
    computedAt: typeof row.computed_at === "string" ? row.computed_at : null,
    quality: row.quality as SecurityDailyHistory["quality"],
    freshness: row.freshness as SecurityDailyHistory["freshness"],
    provenance: row.provenance as SecurityDailyHistory["provenance"],
  };
}

async function listSecurityCandidates(bridge: HistoricalBridgeClient): Promise<SecurityId[]> {
  const ids: SecurityId[] = [];
  let after: string | null = null;
  for (;;) {
    const res = await bridge.call("behavior_profile_list_candidates", {
      after_security_id: after,
      page_limit: CANDIDATE_PAGE,
    });
    const rows = Array.isArray(res.result) ? res.result as Record<string, unknown>[] : [];
    if (rows.length === 0) break;
    for (const row of rows) {
      ids.push(String(row.security_id) as SecurityId);
    }
    after = String(rows[rows.length - 1]!.security_id);
    if (rows.length < CANDIDATE_PAGE) break;
  }
  return ids;
}

async function main() {
  const bridge = new HistoricalBridgeClient(requireHistoricalBridgeConfig());
  const linkedAt = new Date().toISOString();
  const securityIds = await listSecurityCandidates(bridge);

  let securitiesProcessed = 0;
  let episodesExamined = 0;
  let eventsExamined = 0;
  let linksWritten = 0;
  let outsideWindowRejects = 0;
  let wrongSecurityRejects = 0;
  let timestampRejects = 0;
  let otherRejects = 0;

  for (const securityId of securityIds) {
    const eventsRes = await bridge.call("corporate_event_list_for_security", {
      security_id: securityId,
      limit: 2000,
    });
    const eventRows = Array.isArray(eventsRes.result) ? eventsRes.result as Record<string, unknown>[] : [];
    if (eventRows.length === 0) continue;

    const [dailyRows, episodeRows] = await Promise.all([
      bridge.fetchAllRows("historical_list_daily_history", { security_id: securityId }),
      bridge.fetchAllRows("historical_list_episodes", { security_id: securityId }),
    ]);
    const episodes = episodeRows.map(mapEpisode);
    const tradingSessionDates = dailyRows.map(mapDaily).map((row) => row.sessionDate).sort();
    const events = eventRows.map(corporateEventFromRow);

    episodesExamined += episodes.length;
    eventsExamined += events.length;

    const { links, audit } = linkEpisodesForSecurityWithAudit({
      securityId,
      episodes,
      events,
      tradingSessionDates,
      linkedAt,
    });

    outsideWindowRejects += audit.outsideWindowRejects;
    wrongSecurityRejects += audit.wrongSecurityRejects;
    timestampRejects += audit.timestampRejects;
    otherRejects += audit.otherRejects;

    for (let i = 0; i < links.length; i += LINK_BATCH_SIZE) {
      const chunk = links.slice(i, i + LINK_BATCH_SIZE);
      linksWritten += await applyEventReactionLinkBatch(bridge, chunk);
    }

    securitiesProcessed += 1;
    console.log(JSON.stringify({
      msg: "episode_event_link_security_done",
      security_id: securityId,
      episodes: episodes.length,
      events: events.length,
      links: links.length,
    }));
  }

  console.log(JSON.stringify({
    msg: "episode_event_link_complete",
    securities_processed: securitiesProcessed,
    episodes_examined: episodesExamined,
    events_examined: eventsExamined,
    links_written: linksWritten,
    outside_window_rejects: outsideWindowRejects,
    wrong_security_rejects: wrongSecurityRejects,
    timestamp_rejects: timestampRejects,
    other_rejects: otherRejects,
  }));
}

main().catch((error) => {
  console.error(JSON.stringify({ msg: "episode_event_link_failed", error: String(error) }));
  process.exit(1);
});
