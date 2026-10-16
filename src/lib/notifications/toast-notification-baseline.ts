/** Per-account floor for the current browser session (sessionStorage). */

export function toastNotificationBaselineKey(storageNamespace: string, userId: string): string {
  return `${storageNamespace}:${userId.trim()}`;
}

/**
 * Returns baseline ms for this account in the current browser session.
 * Creates the floor on first access; survives reloads, resets on a new browser session.
 */
export function getToastNotificationBaselineMs(
  storageNamespace: string,
  userId: string,
  nowMs = Date.now(),
): number {
  if (typeof sessionStorage === "undefined" || !userId.trim()) return nowMs;
  const key = toastNotificationBaselineKey(storageNamespace, userId);
  try {
    const raw = sessionStorage.getItem(key);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
    sessionStorage.setItem(key, String(nowMs));
    return nowMs;
  } catch {
    return nowMs;
  }
}

/** Idempotent: call when authenticated listener activity starts (including before first query). */
export function ensureToastNotificationBaselineMs(
  storageNamespace: string,
  userId: string,
  nowMs = Date.now(),
): number {
  return getToastNotificationBaselineMs(storageNamespace, userId, nowMs);
}

export function isAtOrAfterBaseline(timestampMs: number, baselineMs: number): boolean {
  if (!Number.isFinite(timestampMs)) return false;
  return timestampMs >= baselineMs - 1_000;
}
