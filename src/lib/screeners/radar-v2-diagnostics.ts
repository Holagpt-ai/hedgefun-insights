/**
 * Radar V2 consumer load diagnostics (D11).
 *
 * Machine-readable reasons for why Radar V2 was adopted or why the loader
 * fell back. Recorded in-memory for tests and logged only in development —
 * never rendered in the normal user UI.
 */

export const RADAR_V2_DECISION_REASONS = [
  "radar_v2_available",
  "radar_v2_empty",
  "no_current_feed_state",
  "session_not_active",
  "no_v2_generation",
  "no_v2_synced_at",
  "radar_v2_stale",
  "radar_v2_receive_stale",
  "generation_race",
  "radar_v2_fetch_error",
  "radar_v2_fetch_threw",
  "radar_v2_retry_exhausted",
  "tab_not_radar_backed",
] as const;

export type RadarV2DecisionReason = (typeof RADAR_V2_DECISION_REASONS)[number];

export interface RadarV2LoadDiagnostic {
  reason: string;
  source: "radar-v2" | "fallback";
  session: string | null;
  attempts: number;
  generationId: string | null;
  declaredCandidateCount: number | null;
  lastAttemptReason: string | null;
}

let lastDiagnostic: RadarV2LoadDiagnostic | null = null;

function shouldLogDiagnostic(): boolean {
  try {
    return import.meta.env?.DEV === true && import.meta.env?.MODE !== "test";
  } catch {
    return false;
  }
}

export function recordRadarV2LoadDiagnostic(d: RadarV2LoadDiagnostic): void {
  lastDiagnostic = d;
  if (!shouldLogDiagnostic()) return;
  // No payloads, symbols, or row contents — reason + bookkeeping only.
  console.info(
    [
      "[radar-v2]",
      `source=${d.source}`,
      `reason=${d.reason}`,
      `attempts=${d.attempts}`,
      `session=${d.session ?? "null"}`,
      `generation=${d.generationId ?? "null"}`,
      `declared=${d.declaredCandidateCount ?? "null"}`,
      `lastAttempt=${d.lastAttemptReason ?? "null"}`,
    ].join(" "),
  );
}

export function peekRadarV2LoadDiagnostic(): RadarV2LoadDiagnostic | null {
  return lastDiagnostic;
}

export function resetRadarV2LoadDiagnostic(): void {
  lastDiagnostic = null;
}

/** Strip a suffixed reason (`session_not_active:market`) to its family key. */
export function radarV2ReasonFamily(reason: string): string {
  const idx = reason.indexOf(":");
  return idx === -1 ? reason : reason.slice(0, idx);
}
