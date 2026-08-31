import { LIFECYCLE_RULE, type LifecycleLabel, type VolumeComparison } from "./types";

export { LIFECYCLE_RULE };

/**
 * Analysis-only lifecycle. Not published to production.
 *
 * Exact rule (also stored on the report as lifecycleRule):
 * share15 = vol15 / cumulative.
 * REACTIVATING if share15 < 0.10 and share5 >= 0.03 and prior15 > 0 and vol15 >= prior15 * 1.5.
 * Else ACTIVE if share15 >= 0.10.
 * Else DORMANT if share15 < 0.02.
 * Else FADING if share15 < 0.05 and HOD distance > 3%.
 * Else FADING if share15 < 0.05.
 * Else ACTIVE.
 */
export function classifyLifecycle(
  volume: VolumeComparison,
  hodDistancePct: number | null,
): LifecycleLabel | null {
  const cum = volume.barCumulative;
  const vol15 = volume.vol15;
  const vol5 = volume.vol5;
  const vol30 = volume.vol30;
  if (cum === null || !(cum > 0) || vol15 === null || vol5 === null || vol30 === null) {
    return null;
  }
  const share15 = vol15 / cum;
  const share5 = vol5 / cum;
  const prior15 = vol30 - vol15;
  if (share15 < 0.1 && share5 >= 0.03 && prior15 > 0 && vol15 >= prior15 * 1.5) {
    return "REACTIVATING";
  }
  if (share15 >= 0.1) return "ACTIVE";
  if (share15 < 0.02) return "DORMANT";
  if (share15 < 0.05 && hodDistancePct !== null && hodDistancePct > 3) return "FADING";
  if (share15 < 0.05) return "FADING";
  return "ACTIVE";
}

export function hodDistancePct(price: number | null, hod: number | null): number | null {
  if (price === null || hod === null || !(hod > 0)) return null;
  const pct = ((hod - price) / hod) * 100;
  return Number.isFinite(pct) ? pct : null;
}
