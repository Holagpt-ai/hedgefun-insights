// RVOL computation from a baseline curve. Consumes baselines only; never builds them.
// Failure modes are surfaced as InputsQuality reason codes.

import type { QualityRvol, RvolClass, SessionType } from "./contract.ts";

export interface CurvePoint { m: number; cum: number; }
export interface Baseline {
  baseline_date: string;
  curve: CurvePoint[];
  sessions_used: number;
}

export interface RvolResult {
  rvol: number | null;
  rvol_class: RvolClass | null;
  quality: QualityRvol;
}

function daysBetween(a: string, b: string): number {
  const ta = Date.parse(a + "T00:00:00Z");
  const tb = Date.parse(b + "T00:00:00Z");
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return Number.POSITIVE_INFINITY;
  return Math.round((tb - ta) / (24 * 60 * 60 * 1000));
}

function isValidCurve(curve: unknown): curve is CurvePoint[] {
  if (!Array.isArray(curve) || curve.length === 0) return false;
  let lastM = -1;
  let lastCum = -1;
  for (const p of curve) {
    if (!p || typeof p !== "object") return false;
    const m = (p as { m?: unknown }).m;
    const c = (p as { cum?: unknown }).cum;
    if (typeof m !== "number" || !Number.isInteger(m) || m < 0 || m > 389) return false;
    if (m <= lastM) return false;
    if (typeof c !== "number" || !Number.isFinite(c) || c < 0) return false;
    if (c < lastCum) return false;
    lastM = m;
    lastCum = c;
  }
  return true;
}

function classify(rvol: number): RvolClass {
  if (rvol < 1.5) return "normal";
  if (rvol < 3.0) return "elevated";
  return "unusual";
}

/**
 * @param sessionType - RVOL is only computed for RTH in this stage.
 * @param sessionDate - ET session date (YYYY-MM-DD).
 * @param etNowMinutes - Minutes since ET midnight (used for m_now).
 * @param cumulativeVolume - Cumulative validated bar volume so far today.
 * @param baseline - Latest baseline row for the ticker with baseline_date < sessionDate, or null.
 */
export function computeRvol(
  sessionType: SessionType,
  sessionDate: string,
  etNowMinutes: number,
  cumulativeVolume: number | null,
  baseline: Baseline | null,
): RvolResult {
  if (sessionType !== "rth") {
    return { rvol: null, rvol_class: null, quality: "not_applicable_session" };
  }
  if (!baseline) return { rvol: null, rvol_class: null, quality: "no_baseline" };
  const dayGap = daysBetween(baseline.baseline_date, sessionDate);
  if (dayGap <= 0 || dayGap > 10) {
    return { rvol: null, rvol_class: null, quality: "baseline_incompatible" };
  }
  if (!Number.isInteger(baseline.sessions_used) || baseline.sessions_used < 10 || baseline.sessions_used > 20) {
    return { rvol: null, rvol_class: null, quality: "baseline_invalid" };
  }
  if (!isValidCurve(baseline.curve)) {
    return { rvol: null, rvol_class: null, quality: "baseline_invalid" };
  }
  if (cumulativeVolume === null || !Number.isFinite(cumulativeVolume) || cumulativeVolume < 0) {
    return { rvol: null, rvol_class: null, quality: "baseline_invalid" };
  }

  let mNow = etNowMinutes - 570;
  if (mNow < 0) mNow = 0;
  if (mNow > 389) mNow = 389;

  const curve = baseline.curve;
  const first = curve[0];
  const last = curve[curve.length - 1];
  if (mNow < first.m || mNow > last.m) {
    return { rvol: null, rvol_class: null, quality: "baseline_invalid" };
  }

  // Linear interpolation
  let expected: number | null = null;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i], b = curve[i + 1];
    if (mNow === a.m) { expected = a.cum; break; }
    if (mNow === b.m) { expected = b.cum; break; }
    if (mNow > a.m && mNow < b.m) {
      const t = (mNow - a.m) / (b.m - a.m);
      expected = a.cum + t * (b.cum - a.cum);
      break;
    }
  }
  if (expected === null) {
    if (mNow === last.m) expected = last.cum;
  }
  if (expected === null || !Number.isFinite(expected) || expected <= 0) {
    return { rvol: null, rvol_class: null, quality: "baseline_invalid" };
  }

  const rvolRaw = cumulativeVolume / expected;
  const rvol = Math.round(rvolRaw * 100) / 100;
  return { rvol, rvol_class: classify(rvol), quality: "ok" };
}
