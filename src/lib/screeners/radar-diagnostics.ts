/**
 * Day-Trade Radar qualification diagnostics.
 * Mirrors production prerequisites in supabase/functions/_shared/screeners/selection.ts
 * without loosening them. Volume-first ranking is applied after qualification.
 */

export type RadarRejectReason =
  | "missing_invalid_snapshot"
  | "price_range_failure"
  | "minimum_volume_failure"
  | "percentage_move_failure"
  | "volume_ratio_failure";

export interface RadarQuote {
  ticker?: unknown;
  updated?: unknown;
  day?: { c?: unknown; v?: unknown };
  prevDay?: { c?: unknown; v?: unknown };
}

export interface RadarCandidateDiagnostic {
  symbol: string | null;
  qualified: boolean;
  reasons: RadarRejectReason[];
}

export interface RadarRejectionSummary {
  evaluated: number;
  qualified: number;
  rejected: number;
  counts: Record<RadarRejectReason, number>;
}

const TICKER_RE = /^[A-Z][A-Z0-9.-]*$/;

function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim().toUpperCase();
  if (!s || s.length > 12 || !TICKER_RE.test(s)) return null;
  return s;
}

function finitePositive(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !(n > 0)) return null;
  return n;
}

function finiteNumber(v: unknown): number | null {
  if (v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function regularClose(t: RadarQuote): number | null {
  return finitePositive(t?.day?.c);
}

function previousClose(t: RadarQuote): number | null {
  return finitePositive(t?.prevDay?.c);
}

function regularChangePercent(t: RadarQuote): number | null {
  const close = regularClose(t);
  const prev = previousClose(t);
  if (close === null || prev === null || prev === 0) return null;
  const pct = ((close - prev) / prev) * 100;
  return Number.isFinite(pct) ? pct : null;
}

function dayVolume(t: RadarQuote): number | null {
  return finiteNumber(t?.day?.v);
}

function volumeRatio(t: RadarQuote): number | null {
  const dayVol = dayVolume(t);
  const priorVol = finitePositive(t?.prevDay?.v);
  if (dayVol === null || !(dayVol > 0) || priorVol === null) return null;
  const ratio = dayVol / priorVol;
  if (!Number.isFinite(ratio) || !(ratio > 0)) return null;
  return ratio;
}

function hasProviderAsOf(raw: unknown, nowMs: number): boolean {
  if (!Number.isFinite(nowMs)) return false;
  let nanos: number | null = null;
  if (typeof raw === "number" && Number.isFinite(raw) && Number.isInteger(raw) && raw > 0) {
    nanos = raw;
  } else if (typeof raw === "string" && /^\d+$/.test(raw.trim()) && raw.trim().length <= 22) {
    nanos = Number(raw.trim());
  }
  if (nanos === null || !(nanos > 0)) return false;
  const ms = Math.trunc(nanos / 1_000_000);
  if (!(ms > 0) || !Number.isFinite(ms)) return false;
  if (ms > nowMs + 5 * 60_000) return false;
  return true;
}

/** Existing production gate: $2–$20, +10% session move, 5× prior-session volume. */
export function qualifiesDayTradeRadar(t: RadarQuote): boolean {
  const price = regularClose(t);
  const chg = regularChangePercent(t);
  const ratio = volumeRatio(t);
  if (price === null || chg === null || ratio === null) return false;
  return price >= 2 && price <= 20 && chg >= 10 && ratio >= 5;
}

export function evaluateDayTradeRadar(t: RadarQuote, nowMs: number): RadarCandidateDiagnostic {
  const symbol = normalizeSymbol(t?.ticker);
  const reasons: RadarRejectReason[] = [];
  const price = regularClose(t);
  const chg = regularChangePercent(t);
  const vol = dayVolume(t);
  const ratio = volumeRatio(t);
  const asOf = hasProviderAsOf(t.updated, nowMs);

  if (!symbol || !asOf || price === null) reasons.push("missing_invalid_snapshot");
  if (vol === null || !(vol > 0)) reasons.push("minimum_volume_failure");
  if (price !== null && (price < 2 || price > 20)) reasons.push("price_range_failure");
  if (chg === null || chg < 10) reasons.push("percentage_move_failure");
  if (ratio === null || ratio < 5) reasons.push("volume_ratio_failure");

  const qualified = qualifiesDayTradeRadar(t) && asOf && symbol !== null;
  return { symbol, qualified, reasons: qualified ? [] : reasons };
}

export function summarizeRadarDiagnostics(diags: RadarCandidateDiagnostic[]): RadarRejectionSummary {
  const counts: Record<RadarRejectReason, number> = {
    missing_invalid_snapshot: 0,
    price_range_failure: 0,
    minimum_volume_failure: 0,
    percentage_move_failure: 0,
    volume_ratio_failure: 0,
  };
  let qualified = 0;
  for (const d of diags) {
    if (d.qualified) {
      qualified += 1;
      continue;
    }
    for (const r of d.reasons) counts[r] += 1;
  }
  return {
    evaluated: diags.length,
    qualified,
    rejected: diags.length - qualified,
    counts,
  };
}

export function formatRadarRejectionLog(summary: RadarRejectionSummary): string {
  return [
    "day_trade_radar_diagnostics",
    `evaluated=${summary.evaluated}`,
    `qualified=${summary.qualified}`,
    `rejected=${summary.rejected}`,
    `missing_invalid_snapshot=${summary.counts.missing_invalid_snapshot}`,
    `price_range_failure=${summary.counts.price_range_failure}`,
    `minimum_volume_failure=${summary.counts.minimum_volume_failure}`,
    `percentage_move_failure=${summary.counts.percentage_move_failure}`,
    `volume_ratio_failure=${summary.counts.volume_ratio_failure}`,
  ].join(" ");
}

/** Preserve incoming volume-desc order. Enrichment must not reorder. */
export function preserveVolumeOrder<T extends { volume: number | null | undefined }>(rows: T[]): T[] {
  return rows;
}
