/** Optional Radar V2 scanner context for watchlist AI (no fabricated fields). */

export type RadarScannerContext = {
  primary_event: string | null;
  primary_event_at: string | null;
  rvol_5m: number | null;
  volume_velocity: number | null;
  volume_acceleration_pct: number | null;
  distance_from_hod_pct: number | null;
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
      "primary_scanner_event, primary_scanner_event_at, rvol_5m, volume_velocity, volume_acceleration_pct, distance_from_hod_pct",
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
  return {
    primary_event: str(data.primary_scanner_event),
    primary_event_at: str(data.primary_scanner_event_at),
    rvol_5m: num(data.rvol_5m),
    volume_velocity: num(data.volume_velocity),
    volume_acceleration_pct: num(data.volume_acceleration_pct),
    distance_from_hod_pct: num(data.distance_from_hod_pct),
  };
}

export function radarContextReasonCodes(ctx: RadarScannerContext | null): string[] {
  if (!ctx?.primary_event) return [];
  return [`radar_event:${ctx.primary_event}`];
}
