/** Optional Radar V2 scanner context for watchlist AI (no fabricated fields). */

export type RadarScannerContext = {
  primary_event: string | null;
  primary_event_at: string | null;
  promotion_primary_event: string | null;
  promotion_trigger_at: string | null;
  radar_event_lifecycle: string | null;
  rvol_5m: number | null;
  volume_velocity: number | null;
  volume_acceleration_pct: number | null;
  distance_from_hod_pct: number | null;
  participation: {
    time_adjusted_rvol: number | null;
    volume_5m: number | null;
    volume_15m: number | null;
    volume_60m: number | null;
    volume_velocity_5m: number | null;
    volume_velocity_15m: number | null;
    volume_velocity_60m: number | null;
    dollar_volume_velocity_5m: number | null;
    participation_state: string | null;
    baseline_session_count: number | null;
  } | null;
};

export async function fetchRadarScannerContext(
  supabase: {
    from: (table: string) => {
      select: (cols: string) => {
        eq: (col: string, val: string) => {
          eq: (col: string, val: string) => {
            eq: (col: string, val: string) => {
              order: (col: string, opts: { ascending: boolean }) => {
                limit: (n: number) => {
                  maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
                };
              };
            };
          };
        };
      };
    };
  },
  ticker: string,
  sessionDate: string,
): Promise<RadarScannerContext | null> {
  const { data } = await supabase
    .from("radar_v22_candidates")
    .select(
      "primary_scanner_event, primary_scanner_event_at, promotion_reason, radar_event_lifecycle, rvol_5m, volume_velocity, volume_acceleration_pct, distance_from_hod_pct, time_adjusted_rvol, volume_5m, volume_15m, volume_60m, volume_velocity_5m, volume_velocity_15m, volume_velocity_60m, dollar_volume_velocity_5m, participation_state, participation_baseline_session_count",
    )
    .eq("symbol", ticker)
    .eq("trading_date", sessionDate)
    .eq("session_kind", "market")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;
  const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
  let promotionPrimary: string | null = null;
  let promotionTriggerAt: string | null = null;
  const pr = data.promotion_reason;
  if (pr !== null && typeof pr === "object") {
    const primary = (pr as Record<string, unknown>).primaryEvent;
    if (primary !== null && typeof primary === "object") {
      const p = primary as Record<string, unknown>;
      promotionPrimary = str(p.type);
      promotionTriggerAt = str(p.eventAt);
    }
    if (promotionTriggerAt === null && typeof (pr as Record<string, unknown>).triggerTimestamp === "string") {
      promotionTriggerAt = str((pr as Record<string, unknown>).triggerTimestamp);
    }
  }
  return {
    primary_event: str(data.primary_scanner_event),
    primary_event_at: str(data.primary_scanner_event_at),
    promotion_primary_event: promotionPrimary,
    promotion_trigger_at: promotionTriggerAt,
    radar_event_lifecycle: str(data.radar_event_lifecycle),
    rvol_5m: num(data.rvol_5m),
    volume_velocity: num(data.volume_velocity),
    volume_acceleration_pct: num(data.volume_acceleration_pct),
    distance_from_hod_pct: num(data.distance_from_hod_pct),
    participation: {
      time_adjusted_rvol: num(data.time_adjusted_rvol),
      volume_5m: num(data.volume_5m),
      volume_15m: num(data.volume_15m),
      volume_60m: num(data.volume_60m),
      volume_velocity_5m: num(data.volume_velocity_5m),
      volume_velocity_15m: num(data.volume_velocity_15m),
      volume_velocity_60m: num(data.volume_velocity_60m),
      dollar_volume_velocity_5m: num(data.dollar_volume_velocity_5m),
      participation_state: str(data.participation_state),
      baseline_session_count: typeof data.participation_baseline_session_count === "number"
        ? data.participation_baseline_session_count
        : null,
    },
  };
}

export function radarContextReasonCodes(ctx: RadarScannerContext | null): string[] {
  if (ctx?.promotion_primary_event) {
    return [`radar_promotion:${ctx.promotion_primary_event}`];
  }
  if (!ctx?.primary_event) return [];
  return [`radar_event:${ctx.primary_event}`];
}
