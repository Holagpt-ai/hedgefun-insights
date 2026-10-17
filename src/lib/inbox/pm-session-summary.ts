import { formatScannerEventLabel } from "@/lib/screeners/scanner-events-display";
import {
  classifyPmPrimaryEventFreshness,
  pmHighlightFreshnessLabelForContext,
  pmRadarBoardAllowsHighlightBuild,
  resolvePmPrimaryEventObservation,
  type PmHighlightFreshness,
  type PmRadarBoardContext,
} from "@/lib/inbox/pm-session-evidence";
import { dedupePmSessionSummaryRows } from "@/lib/inbox/pm-session-summary-dedupe";
import { formatEtClock } from "@/lib/screeners/screener-trigger-time";

export type { PmHighlightFreshness, PmRadarBoardContext };

export interface PmSessionSummaryRow {
  symbol: string;
  rank: number;
  volume: number | null;
  primaryEvent: string;
  primaryEventLabel: string;
  observationTimeEt: string | null;
  sourceTradingSession: string | null;
  freshness: PmHighlightFreshness;
  freshnessLabel: string;
  rvol5m: number | null;
  volumeVelocity: number | null;
  distanceFromHodPct: number | null;
  participationNote: string | null;
}

export function buildPmSessionSummaryRows(
  rows: readonly {
    symbol: string;
    rank: number;
    volume?: number | null;
    primary_scanner_event?: string | null;
    primary_scanner_event_at?: string | null;
    scanner_events?: unknown;
    last_hod_break_at?: string | null;
    radar_trading_date?: string | null;
    rvol_5m?: number | null;
    vol_velocity?: number | null;
    hod_distance_percent?: number | null;
    distance_from_hod_pct?: number | null;
    participation_state?: string | null;
  }[],
  context: PmRadarBoardContext,
  limit = 8,
): PmSessionSummaryRow[] {
  if (!pmRadarBoardAllowsHighlightBuild(context.boardState)) {
    return [];
  }

  const candidates: PmSessionSummaryRow[] = [];

  for (const row of rows) {
    const observation = resolvePmPrimaryEventObservation(row, context.nowMs);
    if (!observation) continue;

    let freshness = classifyPmPrimaryEventFreshness({
      eventType: observation.type,
      eventAtUtc: observation.atUtc,
      radarTradingDate: row.radar_trading_date ?? null,
      applicableTradingDate: context.applicableTradingDate,
      nowMs: context.nowMs,
    });
    if (!freshness) continue;

    if (context.priorSessionEvidence) {
      freshness = "prior_session_snapshot";
    }

    const label = formatScannerEventLabel(observation.type) ?? observation.type;
    const participation = row.participation_state?.trim();
    candidates.push({
      symbol: row.symbol.trim().toUpperCase(),
      rank: row.rank,
      volume: finiteOrNull(row.volume),
      primaryEvent: observation.type,
      primaryEventLabel: label,
      observationTimeEt: observation.atUtc ? formatEtClock(observation.atUtc) : null,
      sourceTradingSession: row.radar_trading_date ?? context.applicableTradingDate,
      freshness,
      freshnessLabel: pmHighlightFreshnessLabelForContext(freshness, context),
      rvol5m: finiteOrNull(row.rvol_5m),
      volumeVelocity: finiteOrNull(row.vol_velocity),
      distanceFromHodPct: finiteOrNull(row.hod_distance_percent ?? row.distance_from_hod_pct),
      participationNote:
        participation && /cool|inactive|stale/i.test(participation)
          ? "Participation cooled · recorded event only"
          : null,
    });
  }

  return dedupePmSessionSummaryRows(candidates).slice(0, limit);
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
