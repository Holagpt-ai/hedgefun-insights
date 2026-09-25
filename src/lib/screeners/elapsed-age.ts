/**
 * Elapsed age from a stored event timestamp.
 * The event instant never moves; only the caller-supplied clock does.
 */

export function formatElapsedAge(
  eventIso: string | null | undefined,
  nowMs: number,
): string | null {
  if (eventIso === null || eventIso === undefined || eventIso === "") return null;
  const at = Date.parse(eventIso);
  if (!Number.isFinite(at) || !Number.isFinite(nowMs)) return null;
  const elapsed = Math.max(0, Math.floor((nowMs - at) / 1000));
  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  if (hours >= 1) {
    return `${hours}h ${minutes}m ${String(seconds).padStart(2, "0")}s ago`;
  }
  if (minutes >= 1) return `${minutes}m ${seconds}s ago`;
  return `${seconds}s ago`;
}
