import { isScannerEventType } from "../radar-v22/scanner-events.ts";
import type { ScannerAlertFiring } from "./types.ts";

function finiteNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function readString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

export function parseScannerAlertFirings(raw: unknown): ScannerAlertFiring[] {
  if (!Array.isArray(raw)) return [];
  const out: ScannerAlertFiring[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const symbol = readString(row.symbol);
    const event_type = readString(row.event_type);
    const event_at = readString(row.event_at);
    const trading_date = readString(row.trading_date);
    const session_kind = readString(row.session_kind);
    if (!symbol || !event_at || !trading_date || !session_kind) continue;
    if (!event_type || !isScannerEventType(event_type)) continue;
    out.push({
      symbol: symbol.toUpperCase(),
      event_type,
      event_at,
      trading_date,
      session_kind,
      price: finiteNum(row.price),
      move_pct: finiteNum(row.move_pct),
      today_volume: finiteNum(row.today_volume),
      prior_volume: finiteNum(row.prior_volume),
      vol_prior: finiteNum(row.vol_prior),
      rvol_5m: finiteNum(row.rvol_5m),
      volume_velocity: finiteNum(row.volume_velocity),
      volume_acceleration_pct: finiteNum(row.volume_acceleration_pct),
      distance_from_hod_pct: finiteNum(row.distance_from_hod_pct),
      session_vwap: finiteNum(row.session_vwap),
    });
  }
  return out;
}
