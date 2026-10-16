/** Per-account floor: notifications observed/delivered before this time are backlog, not live toasts. */

export function toastNotificationBaselineKey(storageNamespace: string, userId: string): string {
  return `${storageNamespace}:${userId.trim()}`;
}

/** Returns baseline ms; creates one on first access for this account in this browser. */
export function getToastNotificationBaselineMs(
  storageNamespace: string,
  userId: string,
  nowMs = Date.now(),
): number {
  if (typeof localStorage === "undefined" || !userId.trim()) return nowMs;
  const key = toastNotificationBaselineKey(storageNamespace, userId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
    localStorage.setItem(key, String(nowMs));
    return nowMs;
  } catch {
    return nowMs;
  }
}

export function isAtOrAfterBaseline(timestampMs: number, baselineMs: number): boolean {
  if (!Number.isFinite(timestampMs)) return false;
  return timestampMs >= baselineMs - 1_000;
}
