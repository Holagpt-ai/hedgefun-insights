import { RVOL_5M_MIN_TOD_SAMPLES } from "@/config/scanner-intelligence-v2.config";

export type Rvol5mBaseline = {
  expectedVolume: number;
  sampleCount: number;
};

/** Client/worker parity: null when baseline insufficient — no 1.0 fallback. */
export function computeRvol5mFromBaseline(
  current5mVolume: number | null | undefined,
  baseline: Rvol5mBaseline | null | undefined,
): number | null {
  if (baseline == null) return null;
  if (baseline.sampleCount < RVOL_5M_MIN_TOD_SAMPLES) return null;
  if (!(baseline.expectedVolume > 0) || !Number.isFinite(baseline.expectedVolume)) return null;
  if (current5mVolume == null || !Number.isFinite(current5mVolume) || current5mVolume < 0) {
    return null;
  }
  if (current5mVolume === 0) return 0;
  const ratio = current5mVolume / baseline.expectedVolume;
  return Number.isFinite(ratio) ? Math.round(ratio * 100) / 100 : null;
}
