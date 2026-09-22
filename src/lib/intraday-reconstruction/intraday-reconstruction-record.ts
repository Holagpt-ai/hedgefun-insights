import type { EpisodeIntradayReconstructionFacts } from "@/lib/intraday-reconstruction/intraday-reconstruction-types";

export function reconstructionFactsToPersistRow(
  facts: EpisodeIntradayReconstructionFacts,
): Record<string, unknown> {
  return {
    episode_id: facts.episodeId,
    security_id: facts.securityId,
    session_date: facts.sessionDate,
    completeness_state: facts.completenessState,
    bar_granularity: facts.barGranularity,
    bars_expected: facts.barsExpected,
    bars_available: facts.barsAvailable,
    reg_bars_expected: facts.regBarsExpected,
    reg_bars_available: facts.regBarsAvailable,
    session_coverage_pct: facts.sessionCoveragePct,
    provider: facts.provider,
    source: facts.source,
    source_as_of: facts.sourceAsOf,
    fetched_at: facts.fetchedAt,
    computed_at: facts.computedAt,
    session_open_at: facts.sessionOpenAt,
    hod_at: facts.hodAt,
    lod_at: facts.lodAt,
    first_major_move_at: facts.firstMajorMoveAt,
    largest_volume_burst_at: facts.largestVolumeBurstAt,
    close_at: facts.closeAt,
    open_price: facts.openPrice,
    hod_price: facts.hodPrice,
    lod_price: facts.lodPrice,
    close_price: facts.closePrice,
    move_open_to_hod_pct: facts.moveOpenToHodPct,
    max_drawdown_from_hod_pct: facts.maxDrawdownFromHodPct,
    largest_pullback_pct: facts.largestPullbackPct,
    recovered_from_pullback: facts.recoveredFromPullback,
    close_vs_hod_pct: facts.closeVsHodPct,
    close_position: facts.closePosition,
    total_intraday_volume: facts.totalIntradayVolume,
    largest_bar_volume: facts.largestBarVolume,
    volume_before_hod: facts.volumeBeforeHod,
    volume_after_hod: facts.volumeAfterHod,
    volume_concentration_top5_pct: facts.volumeConcentrationTop5Pct,
    premarket_high: facts.premarketHigh,
    premarket_low: facts.premarketLow,
    regular_high: facts.regularHigh,
    regular_low: facts.regularLow,
    after_hours_high: facts.afterHoursHigh,
    after_hours_low: facts.afterHoursLow,
    momentum_leg_count: facts.momentumLegCount,
    major_pullback_count: facts.majorPullbackCount,
    hod_session_phase: facts.hodSessionPhase,
    vwap_at_close: facts.vwapAtClose,
    first_vwap_break_at: facts.firstVwapBreakAt,
    vwap_reclaim_count: facts.vwapReclaimCount,
    seconds_above_vwap: facts.secondsAboveVwap,
    seconds_below_vwap: facts.secondsBelowVwap,
    hod_vs_vwap_pct: facts.hodVsVwapPct,
    halt_count: facts.haltCount,
    first_halt_at: facts.firstHaltAt,
    halt_data_available: facts.haltDataAvailable,
    quality: facts.completenessState === "COMPLETE" ? "DERIVED" : "PARTIAL",
    freshness: "UNKNOWN",
    provenance: "DERIVED",
  };
}

export function timelineEventsToPersistRows(
  facts: EpisodeIntradayReconstructionFacts,
): Record<string, unknown>[] {
  return facts.timeline.map((event) => ({
    episode_event_id: event.episodeEventId,
    episode_id: event.episodeId,
    security_id: event.securityId,
    event_type: event.eventType,
    event_at: event.eventAt,
    price: event.price,
    volume: event.volume,
    metadata: event.metadata,
    provenance: "DERIVED",
    source: facts.source,
    source_as_of: facts.sourceAsOf,
  }));
}

export function mapPersistedRowToRepeatMoverEvidence(
  row: Record<string, unknown>,
): import("@/lib/intraday-reconstruction/intraday-reconstruction-types").RepeatMoverIntradayEvidence {
  return {
    hodAt: typeof row.hod_at === "string" ? row.hod_at : null,
    closeVsHodPct: row.close_vs_hod_pct == null ? null : Number(row.close_vs_hod_pct),
    largestPullbackPct: row.largest_pullback_pct == null ? null : Number(row.largest_pullback_pct),
    recoveredFromPullback: row.recovered_from_pullback === true
      ? true
      : row.recovered_from_pullback === false
        ? false
        : null,
    haltCount: row.halt_count == null ? null : Number(row.halt_count),
    vwapReclaimCount: row.vwap_reclaim_count == null ? null : Number(row.vwap_reclaim_count),
    largestVolumeBurstAt: typeof row.largest_volume_burst_at === "string"
      ? row.largest_volume_burst_at
      : null,
    completenessState: String(row.completeness_state ?? "UNAVAILABLE") as import("@/config/intraday-reconstruction.config").IntradayCompletenessState,
  };
}
