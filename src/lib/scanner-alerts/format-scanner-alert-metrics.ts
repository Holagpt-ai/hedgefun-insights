import type { ScannerIntelligenceAlertRow } from "@/types/scanner-intelligence-alert";

export function formatScannerAlertMetricLine(row: ScannerIntelligenceAlertRow): string {
  const parts: string[] = [];
  if (row.rvol_5m !== null && Number.isFinite(row.rvol_5m)) {
    parts.push(`${row.rvol_5m.toFixed(1)}x 5m RVOL`);
  }
  if (row.volume_velocity !== null && Number.isFinite(row.volume_velocity)) {
    const v = row.volume_velocity;
    const label = v >= 1_000_000
      ? `${(v / 1_000_000).toFixed(1)}M/min`
      : v >= 1_000
      ? `${Math.round(v / 1_000)}K/min`
      : `${Math.round(v)}/min`;
    parts.push(label);
  }
  if (parts.length === 0 && row.today_volume !== null) {
    const vol = row.today_volume;
    parts.push(
      vol >= 1_000_000
        ? `${(vol / 1_000_000).toFixed(1)}M vol`
        : `${Math.round(vol / 1_000)}K vol`,
    );
  }
  return parts.join(" · ");
}

export function repeatMoverContextLine(row: ScannerIntelligenceAlertRow): string | null {
  const meta = row.metadata ?? {};
  const label = typeof meta.repeat_mover_label === "string"
    ? meta.repeat_mover_label
    : null;
  if (label) return label;
  const count = row.comparable_episode_count ?? row.historical_match_count;
  if (count !== null && count > 0) {
    return count === 1 ? "Repeat mover · 1 similar" : `Repeat mover · ${count} similar`;
  }
  return null;
}
