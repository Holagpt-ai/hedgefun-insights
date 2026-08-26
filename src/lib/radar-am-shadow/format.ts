import type { ShadowCandidate, ShadowComparison } from "./types";

function fmtNum(n: number | null, digits = 2): string {
  if (n === null || !Number.isFinite(n)) return "unavailable";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

function fmtPct(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "unavailable";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

function fmtAge(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "unavailable";
  return `${Math.round(ms / 1000)}s`;
}

function lineScreener(row: ShadowCandidate): string {
  return `${row.rank}. ${row.symbol} | session_vol=${fmtNum(row.sessionVolume, 0)} | change=${fmtPct(row.changePercent)} | age=${fmtAge(row.dataAgeMs)} | provider_ts=${row.providerTimestamp ?? "unavailable"} | row_ts=${row.rowTimestamp ?? "unavailable"}`;
}

function lineV22(row: ShadowCandidate): string {
  return `${row.rank}. ${row.symbol} | session_vol=${fmtNum(row.sessionVolume, 0)} | vol5=${fmtNum(row.rollingVolume5s, 0)} | vol15=${fmtNum(row.rollingVolume15s, 0)} | vol60=${fmtNum(row.rollingVolume60s, 0)} | $vol60=${fmtNum(row.rollingDollarVolume60s, 0)} | accel_5m=${row.acceleration5m === null ? "unavailable" : row.acceleration5m.toFixed(4)} | vwap=${row.sessionVwap === null ? "unavailable" : row.sessionVwap.toFixed(4)} | hod_dist=${row.distanceFromHodPct === null ? "unavailable" : `${row.distanceFromHodPct}%`} | lifecycle=${row.lifecycle ?? "unavailable"} | signal=${row.signalStatus ?? "unavailable"} | age=${fmtAge(row.dataAgeMs)} | provider_ts=${row.providerTimestamp ?? "unavailable"}`;
}

function joinList(values: string[]): string {
  return values.length === 0 ? "(none)" : values.join(", ");
}

/**
 * Deterministic text report. Facts only — no generated narrative.
 */
export function formatAmRadarShadowReport(c: ShadowComparison): string {
  const screenerLines =
    c.screenerTop3.length === 0
      ? ["(empty)"]
      : c.screenerTop3.map(lineScreener);
  const v22Lines = c.v22Top3.length === 0 ? ["(empty)"] : c.v22Top3.map(lineV22);
  const rankLines = c.rankPairs.map(
    (p) =>
      `${p.symbol} screener=${p.screenerRank ?? "absent"} v22=${p.v22Rank ?? "absent"}`,
  );
  const orderLines =
    c.orderingDifferences.length === 0
      ? ["(none)"]
      : c.orderingDifferences.map(
          (p) => `${p.symbol} screener=${p.screenerRank} v22=${p.v22Rank}`,
        );

  return [
    `AM RADAR SHADOW — ${c.evaluatedEt}`,
    `evaluated_at_utc=${c.evaluatedAtIso}`,
    `today_et=${c.todayEt}`,
    `evaluation_session=${c.sessionKind}`,
    "",
    "Current Screener",
    `source=screener_results.day_trade_radar`,
    `status=${c.screenerStatus}`,
    ...screenerLines,
    "",
    "Radar V2.2",
    `source=radar_v22_board`,
    `status=${c.v22Status}`,
    `session_date=${c.sessionSafety.v22SessionDate ?? "unavailable"}`,
    `feed_status=${c.sessionSafety.v22FeedStatus ?? "unavailable"}`,
    `client_status=${c.sessionSafety.v22ClientStatus ?? "unavailable"}`,
    ...v22Lines,
    "",
    `Top-3 overlap: ${c.overlapCount}/3`,
    `shared=${joinList(c.overlapSymbols)}`,
    `screener_only=${joinList(c.screenerOnly)}`,
    `v22_only=${joinList(c.v22Only)}`,
    "",
    "Rank agreement",
    ...(rankLines.length === 0 ? ["(none)"] : rankLines),
    "Ordering differences",
    ...orderLines,
    "",
    "Freshness",
    `screener_provider_as_of_max=${c.freshness.screenerProviderAsOfMax ?? "unavailable"}`,
    `screener_updated_at_max=${c.freshness.screenerUpdatedAtMax ?? "unavailable"}`,
    `v22_provider_as_of_max=${c.freshness.v22ProviderAsOfMax ?? "unavailable"}`,
    `v22_newer_by_ms=${c.freshness.v22NewerByMs === null ? "unavailable" : String(c.freshness.v22NewerByMs)}`,
    `materially_newer=${c.freshness.materiallyNewer === null ? "unavailable" : String(c.freshness.materiallyNewer)}`,
    `screener_stale=${String(c.freshness.screenerStale)}`,
    `v22_stale=${String(c.freshness.v22Stale)}`,
    "",
    "Volume",
    `volume_first_leader_match=${c.volume.volumeFirstLeaderMatch === null ? "unavailable" : String(c.volume.volumeFirstLeaderMatch)}`,
    `screener_leader=${c.volume.screenerLeaderSymbol ?? "unavailable"}`,
    `v22_leader=${c.volume.v22LeaderSymbol ?? "unavailable"}`,
    `thin_over_liquid=${String(c.volume.thinOverLiquid)}`,
    `stale_cumulative=${joinList(c.volume.staleCumulativeSymbols)}`,
    `fresh_velocity_not_in_screener=${joinList(c.volume.freshVelocityNotInScreener)}`,
    `high_activity_vol60=${joinList(c.volume.highActivitySymbols)}`,
    `accelerating=${joinList(c.volume.acceleratingSymbols)}`,
    `cooling=${joinList(c.volume.coolingSymbols)}`,
    "",
    "Session safety",
    `date_mismatch=${String(c.sessionSafety.dateMismatch)}`,
    `prior_session_board=${String(c.sessionSafety.priorSessionBoard)}`,
    `leftover_board_outside_regular=${String(c.sessionSafety.leftoverBoardOutsideRegular)}`,
    `v22_evaluates_this_session=${String(c.sessionSafety.v22EvaluatesThisSession)}`,
    `v22_raw_row_count=${String(c.sessionSafety.v22RawRowCount)}`,
    `v22_adopted_row_count=${String(c.sessionSafety.v22AdoptedRowCount)}`,
  ].join("\n");
}
