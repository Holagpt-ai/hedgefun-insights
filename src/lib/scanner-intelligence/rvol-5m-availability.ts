/**
 * Honest 5-minute RVOL availability — never substitutes daily RVOL or VOL/YDAY.
 *
 * Distinguishes a valid zero from missing baseline, non-RTH session, stale
 * observation, and a missing current window.
 */

export type Rvol5mUnavailableReason =
  | "missing_baseline"
  | "not_regular_session"
  | "stale"
  | "no_volume_window";

export type Rvol5mAvailability =
  | { kind: "value"; value: number }
  | { kind: "valid_zero" }
  | { kind: "unavailable"; reason: Rvol5mUnavailableReason };

export type Rvol5mAvailabilityInput = {
  rvol5m: number | null | undefined;
  sessionKind?: string | null;
  current5mVolume?: number | null;
  stale?: boolean;
};

function finiteNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value;
}

export function assessRvol5mAvailability(input: Rvol5mAvailabilityInput): Rvol5mAvailability {
  if (input.stale === true) {
    return { kind: "unavailable", reason: "stale" };
  }

  const session = typeof input.sessionKind === "string" ? input.sessionKind : null;
  if (session !== null && session !== "market") {
    const value = finiteNumber(input.rvol5m);
    if (value === null) {
      return { kind: "unavailable", reason: "not_regular_session" };
    }
  }

  const value = finiteNumber(input.rvol5m);
  if (value === 0) return { kind: "valid_zero" };
  if (value !== null) return { kind: "value", value };

  const windowVolume = finiteNumber(input.current5mVolume);
  if (windowVolume === null) {
    return { kind: "unavailable", reason: "no_volume_window" };
  }
  return { kind: "unavailable", reason: "missing_baseline" };
}

export function rvol5mCellTitle(value: number | null | undefined): string {
  const assessed = assessRvol5mAvailability({ rvol5m: value ?? null });
  if (assessed.kind === "value" || assessed.kind === "valid_zero") {
    return "5-minute RVOL versus the same regular-session clock window.";
  }
  return "5-minute RVOL unavailable. Daily volume and VOL/YDAY are not substitutes.";
}
