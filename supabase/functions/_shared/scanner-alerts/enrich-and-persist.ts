import { assembleRepeatMoverContext } from "../repeat-movers/assemble-repeat-mover-context.ts";
import type { RepeatMoverContextInput } from "../repeat-movers/types.ts";
import { attachForwardOutcomesToComparables } from "../forward-outcomes/attach-comparables.ts";
import {
  buildScannerAlertCopy,
  catalystDisplayLabel,
  severityForEvent,
} from "./build-alert-copy.ts";
import { scannerAlertDedupeKey } from "./dedupe-key.ts";
import type { ScannerAlertFiring, ScannerIntelligenceAlertRow } from "./types.ts";
import { BEHAVIOR_PROFILE_SELECT, BEHAVIOR_PROFILE_TABLE } from "../../radar-worker-bridge/behavior-handlers.ts";
import {
  DAILY_HISTORY_SELECT,
  DAILY_HISTORY_TABLE,
  EPISODE_SELECT,
  EPISODES_TABLE,
  HISTORICAL_PAGE_MAX,
  type HistoricalSelectQuery,
} from "../../radar-worker-bridge/historical-handlers.ts";
import { FORWARD_OUTCOME_LIST_BY_EPISODES_RPC } from "../../radar-worker-bridge/forward-outcome-handlers.ts";
import type { DbClient } from "../../radar-worker-bridge/handler.ts";
import {
  type CatalystRowLike,
  pickStrongestVerifiedCatalyst,
  scannerCatalystSupportingFields,
} from "../catalyst/intelligence-v2.ts";

async function fetchAllForSecurity(
  db: DbClient,
  table: string,
  select: string,
  securityId: string,
  orderCol: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  for (;;) {
    const result = await (db.from(table).select(select) as unknown as HistoricalSelectQuery)
      .eq("security_id", securityId)
      .order(orderCol, { ascending: true })
      .range(offset, offset + HISTORICAL_PAGE_MAX - 1);
    if (result.error) throw new Error("persist_failed");
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < HISTORICAL_PAGE_MAX) break;
    offset += HISTORICAL_PAGE_MAX;
  }
  return rows;
}

async function resolveSecurityId(
  db: DbClient,
  symbol: string,
): Promise<string | null> {
  // deno-lint-ignore no-explicit-any
  const result = await (db.from("securities") as any)
    .select("security_id")
    .eq("current_symbol", symbol.toUpperCase())
    .maybeSingle();
  if (result.error || !result.data) return null;
  const id = (result.data as { security_id?: string }).security_id;
  return typeof id === "string" ? id : null;
}

async function pickVerifiedCatalyst(
  db: DbClient,
  symbol: string,
): Promise<{
  id: string;
  event_type: string;
  title: string | null;
  taxonomy_v2: string | null;
  freshness_class: string | null;
} | null> {
  // deno-lint-ignore no-explicit-any
  const result = await (db.from("catalyst_events") as any)
    .select(
      "id, symbol, event_type, title, event_date, published_at, source_name, source_url, provider, verification_state, dedupe_key",
    )
    .eq("symbol", symbol.toUpperCase())
    .eq("verification_state", "provider_reported")
    .order("published_at", { ascending: false })
    .limit(12);
  if (result.error || !result.data) return null;
  const fetchedAt = new Date().toISOString();
  const best = pickStrongestVerifiedCatalyst(
    result.data as unknown as Array<CatalystRowLike & { id?: string }>,
    symbol,
    Date.parse(fetchedAt),
  );
  if (!best) return null;
  const row = best as { id?: string; event_type?: string; title?: string | null };
  if (!row.id || !row.event_type) return null;
  const support = scannerCatalystSupportingFields(best, fetchedAt);
  return {
    id: row.id,
    event_type: row.event_type,
    title: row.title ?? null,
    taxonomy_v2: support.catalyst_taxonomy_v2,
    freshness_class: support.catalyst_freshness_class,
  };
}

function repeatMoverLabelFromContext(
  comparableCount: number | null,
  profileEpisodeCount: number | null,
): string | null {
  if (comparableCount !== null && comparableCount > 0) {
    return comparableCount === 1
      ? "Repeat mover · 1 similar episode"
      : `Repeat mover · ${comparableCount} similar episodes`;
  }
  if (profileEpisodeCount !== null && profileEpisodeCount >= 2) {
    return "Repeat mover";
  }
  return null;
}

export async function buildEnrichedScannerAlertRow(
  db: DbClient,
  firing: ScannerAlertFiring,
  rpc?: (name: string, args: Record<string, unknown>) => Promise<Response>,
): Promise<ScannerIntelligenceAlertRow> {
  const securityId = await resolveSecurityId(db, firing.symbol);
  let historicalMatchCount: number | null = null;
  let lastSignificantEpisodeDate: string | null = null;
  let lastSignificantEpisodeId: string | null = null;
  let lastEpisodeMovePct: number | null = null;
  let lastEpisodeVolume: number | null = null;
  let lastEpisodeHodTime: string | null = null;
  let comparableEpisodeCount: number | null = null;
  let historicalCatalystType: string | null = null;
  let repeatMoverLabel: string | null = null;
  let profileEpisodeCount: number | null = null;

  if (securityId) {
    const profileResult = await (db.from(BEHAVIOR_PROFILE_TABLE)
      .select(BEHAVIOR_PROFILE_SELECT) as unknown as HistoricalSelectQuery)
      .eq("security_id", securityId)
      .maybeSingle();

    const [dailyHistory, episodes] = await Promise.all([
      fetchAllForSecurity(db, DAILY_HISTORY_TABLE, DAILY_HISTORY_SELECT, securityId, "session_date"),
      fetchAllForSecurity(db, EPISODES_TABLE, EPISODE_SELECT, securityId, "episode_start"),
    ]);

    const currentContext: RepeatMoverContextInput = {
      observedSymbol: firing.symbol.toUpperCase(),
      sessionDate: firing.trading_date,
      movePct: firing.move_pct,
      volume: firing.today_volume,
      rvol: firing.rvol_5m,
      dollarVolume: firing.price !== null && firing.today_volume !== null
        ? firing.price * firing.today_volume
        : null,
      direction: firing.move_pct !== null && firing.move_pct < 0 ? "negative" : "positive",
      tier: null,
      recordedAt: firing.event_at,
    };

    let context = assembleRepeatMoverContext({
      securityId,
      profileRow: profileResult.data ?? null,
      dailyHistory,
      episodes,
      currentContext,
      assembledAt: new Date().toISOString(),
    });

    const comparables = context.comparableHistory.closestComparableEpisodes;
    if (rpc && comparables.length > 0) {
      const foResponse = await rpc(FORWARD_OUTCOME_LIST_BY_EPISODES_RPC, {
        p_episode_ids: comparables.map((e) => e.episodeId),
      });
      if (foResponse.ok) {
        const foText = await foResponse.text();
        let foParsed: Record<string, unknown> = {};
        try {
          foParsed = JSON.parse(foText) as Record<string, unknown>;
        } catch {
          foParsed = {};
        }
        const rawRows = Array.isArray(foParsed.result)
          ? foParsed.result as Record<string, unknown>[]
          : [];
        if (rawRows.length > 0) {
          context = {
            ...context,
            comparableHistory: {
              ...context.comparableHistory,
              closestComparableEpisodes: attachForwardOutcomesToComparables(
                comparables,
                rawRows,
              ),
            },
          };
        }
      }
    }

    comparableEpisodeCount = context.comparableHistory.comparableEpisodeCount;
    historicalMatchCount = comparableEpisodeCount;
    profileEpisodeCount = context.profile.episodeCount;
    const recent = context.comparableHistory.mostRecentComparableEpisode ??
      context.comparableHistory.closestComparableEpisodes[0] ??
      null;
    if (recent) {
      lastSignificantEpisodeDate = recent.sessionDate;
      lastSignificantEpisodeId = recent.episodeId;
      lastEpisodeMovePct = recent.movePct;
      lastEpisodeVolume = recent.volume;
      const intraday = (recent as { observedIntradayReconstruction?: unknown }).observedIntradayReconstruction;
      if (intraday && typeof intraday === "object" && intraday !== null) {
        const hodAt = (intraday as { hodAt?: string | null }).hodAt;
        if (typeof hodAt === "string") lastEpisodeHodTime = hodAt;
      }
      const linked = (recent as { historicalEvents?: unknown }).historicalEvents;
      if (Array.isArray(linked) && linked[0] && typeof linked[0] === "object") {
        const et = (linked[0] as { eventType?: string }).eventType;
        if (typeof et === "string") historicalCatalystType = et;
      }
    } else if (context.profile.latestEpisodeDateUsed) {
      lastSignificantEpisodeDate = context.profile.latestEpisodeDateUsed;
    }

    repeatMoverLabel = repeatMoverLabelFromContext(
      comparableEpisodeCount,
      profileEpisodeCount,
    );
  }

  const catalyst = await pickVerifiedCatalyst(db, firing.symbol);
  const catalystLabel = catalyst
    ? catalystDisplayLabel(catalyst.event_type, catalyst.title)
    : null;

  const { headline, summary } = buildScannerAlertCopy({
    firing,
    repeatMoverLabel,
    lastEpisodeDate: lastSignificantEpisodeDate,
    comparableCount: comparableEpisodeCount,
    catalystLabel,
  });

  const dedupe_key = scannerAlertDedupeKey({
    trading_date: firing.trading_date,
    symbol: firing.symbol,
    event_type: firing.event_type,
    event_at: firing.event_at,
  });

  return {
    dedupe_key,
    symbol: firing.symbol.toUpperCase(),
    trading_date: firing.trading_date,
    session_kind: firing.session_kind,
    event_type: firing.event_type,
    event_at: firing.event_at,
    severity: severityForEvent(firing.event_type),
    price: firing.price,
    move_pct: firing.move_pct,
    today_volume: firing.today_volume,
    prior_volume: firing.prior_volume,
    vol_prior: firing.vol_prior,
    rvol_5m: firing.rvol_5m,
    volume_velocity: firing.volume_velocity,
    volume_acceleration_pct: firing.volume_acceleration_pct,
    distance_from_hod_pct: firing.distance_from_hod_pct,
    historical_match_count: historicalMatchCount,
    last_significant_episode_date: lastSignificantEpisodeDate,
    last_significant_episode_id: lastSignificantEpisodeId,
    last_episode_move_pct: lastEpisodeMovePct,
    last_episode_volume: lastEpisodeVolume,
    last_episode_hod_time: lastEpisodeHodTime,
    comparable_episode_count: comparableEpisodeCount,
    historical_catalyst_type: historicalCatalystType,
    catalyst_type: catalyst?.event_type ?? null,
    catalyst_id: catalyst?.id ?? null,
    headline,
    summary,
    metadata: {
      repeat_mover_label: repeatMoverLabel,
      catalyst_title: catalyst?.title ?? null,
      session_vwap: firing.session_vwap,
    },
  };
}

export async function persistScannerIntelligenceAlerts(
  db: DbClient,
  firings: ScannerAlertFiring[],
  rpc: (name: string, args: Record<string, unknown>) => Promise<Response>,
): Promise<number> {
  let inserted = 0;
  for (const firing of firings) {
    try {
      const row = await buildEnrichedScannerAlertRow(db, firing, rpc);
      const result = await rpc("scanner_intelligence_alert_upsert_v1", { p_row: row });
      if (result.ok) inserted += 1;
    } catch {
      // skip single firing; do not fail radar publish
    }
  }
  return inserted;
}
