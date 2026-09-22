import type { LateSessionSourceCategory } from "@/config/late-session-handoff.config";
import type { BehaviorProfileSampleQuality } from "@/config/behavior-profile.config";
import type { RepeatMoverEvidenceLabel } from "@/config/repeat-mover.config";
import type { LateSessionContinuationContext } from "@/lib/am-inbox/late-session-continuation-types";
import { resolveLateSessionExpiryState } from "@/lib/am-inbox/late-session-expiry";
import type { RadarRepeatMoverProfileFreshnessState } from "@/lib/radar/radar-repeat-movers-types";
import type { SecurityId } from "@/types/security-identity";

export type PersistedLateSessionHandoffRow = {
  id: string;
  security_id: string | null;
  symbol: string;
  source_session_date: string;
  source_timestamp: string;
  source_category: LateSessionSourceCategory;
  last_price: number | null;
  session_move_pct: number | null;
  volume: number | null;
  rvol: number | null;
  dollar_volume: number | null;
  close_distance_from_hod_pct: number | null;
  after_hours_extends: boolean | null;
  catalyst_present: boolean | null;
  float_turnover: number | null;
  historical_context_available: boolean;
  evidence_labels: readonly RepeatMoverEvidenceLabel[] | null;
  sample_size_quality: BehaviorProfileSampleQuality | null;
  comparable_episode_count: number | null;
  most_recent_comparable_date: string | null;
  profile_freshness: string;
  valid_from_session_date: string;
  valid_through_session_date: string;
  capture_freshness_class: string | null;
};

function readNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function mapPersistedLateSessionRow(
  row: PersistedLateSessionHandoffRow,
  amSessionDate: string,
): LateSessionContinuationContext {
  const expiry = resolveLateSessionExpiryState({
    sourceSessionDate: row.source_session_date,
    sourceCategory: row.source_category,
    amSessionDate,
  });
  return {
    securityId: (row.security_id as SecurityId | null) ?? null,
    symbol: row.symbol.trim().toUpperCase(),
    sourceSessionDate: row.source_session_date,
    sourceTimestamp: row.source_timestamp,
    sourceCategory: row.source_category,
    lastPrice: readNumber(row.last_price),
    sessionMovePct: readNumber(row.session_move_pct),
    volume: readNumber(row.volume),
    rvol: readNumber(row.rvol),
    dollarVolume: readNumber(row.dollar_volume),
    closeDistanceFromHodPct: readNumber(row.close_distance_from_hod_pct),
    afterHoursExtends: row.after_hours_extends,
    catalystPresent: row.catalyst_present,
    floatTurnover: readNumber(row.float_turnover),
    historicalContextAvailable: row.historical_context_available,
    evidenceLabels: row.evidence_labels ?? [],
    sampleSizeQuality: row.sample_size_quality,
    comparableEpisodeCount: row.comparable_episode_count ?? 0,
    mostRecentComparableDate: row.most_recent_comparable_date,
    profileFreshness: (row.profile_freshness as RadarRepeatMoverProfileFreshnessState) ?? "UNKNOWN",
    validFromSessionDate: expiry.validFromSessionDate,
    validThroughSessionDate: expiry.validThroughSessionDate,
    expiryState: expiry.expiryState,
  };
}
