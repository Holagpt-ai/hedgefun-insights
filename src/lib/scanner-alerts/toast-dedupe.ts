import {
  markAccountToastHistory,
  mergeToastSeenSets,
  readAccountToastHistory,
} from "@/lib/notifications/account-toast-history";
import { isAtOrAfterBaseline } from "@/lib/notifications/toast-notification-baseline";
import {
  dedupeScannerAlertsByCanonicalIdentity,
  scannerAlertCanonicalToastKey,
} from "@/lib/scanner-alerts/canonical-event-identity";
import {
  isValidScannerAlertObservationMs,
  isWithinScannerLivePopupAgeMs,
  parseObservationMs,
  SCANNER_ALERT_TOAST_LOOKBACK_MS,
} from "@/lib/scanner-alerts/observation-freshness";

export { SCANNER_ALERT_TOAST_LOOKBACK_MS } from "@/lib/scanner-alerts/observation-freshness";

const SESSION_STORAGE_PREFIX = "stocksist-scanner-alert-toasts-v1";
const DURABLE_STORAGE_NAMESPACE = "stocksist-scanner-alert-toasts-v2";
export const SCANNER_ALERT_TOAST_BASELINE_NS = "stocksist-scanner-alert-toast-baseline-v1";
const DURABLE_MAX_ENTRIES = 400;

/** Toast identity: canonical dedupe_key when valid, else persisted row id. */
export function scannerAlertToastKey(row: { id: string; dedupe_key: string }): string {
  return scannerAlertCanonicalToastKey(row);
}

export function scannerAlertSessionStorageKey(userId: string): string {
  return `${SESSION_STORAGE_PREFIX}:${userId.trim()}`;
}

export function scannerAlertDeliveryMs(row: { created_at?: string; event_at: string }): number {
  const created = Date.parse(row.created_at ?? "");
  if (Number.isFinite(created)) return created;
  return Date.parse(row.event_at);
}

export function scannerAlertObservationMs(row: { event_at: string }): number {
  return parseObservationMs(row.event_at);
}

/** Live popup eligibility uses market observation time, not DB insert time. */
export function shouldSurfaceScannerAlertToast(
  row: { created_at?: string; event_at: string },
  baselineMs: number,
  nowMs = Date.now(),
): boolean {
  const observedMs = scannerAlertObservationMs(row);
  if (!isValidScannerAlertObservationMs(observedMs, nowMs)) return false;
  if (!isWithinScannerLivePopupAgeMs(observedMs, nowMs)) return false;
  return isAtOrAfterBaseline(observedMs, baselineMs);
}

/**
 * Expand seen keys with legacy row-id aliases from the current fetch batch.
 * Pre-release clients stored row.id; canonical keys must honor those acknowledgments.
 */
export function expandScannerToastSeenAliases<
  T extends { id: string; dedupe_key: string },
>(rows: readonly T[], seen: ReadonlySet<string>): Set<string> {
  const expanded = new Set(seen);
  const canonicalFromLegacy = new Map<string, string>();
  for (const row of rows) {
    const id = row.id?.trim() ?? "";
    const canonical = scannerAlertToastKey(row);
    if (id) canonicalFromLegacy.set(id, canonical);
    if (id && expanded.has(id)) expanded.add(canonical);
  }
  for (const key of expanded) {
    const canonical = canonicalFromLegacy.get(key);
    if (canonical) expanded.add(canonical);
  }
  for (const row of rows) {
    const canonical = scannerAlertToastKey(row);
    if (expanded.has(canonical)) {
      const id = row.id?.trim() ?? "";
      if (id) expanded.add(id);
    }
  }
  return expanded;
}

export function isScannerAlertToastSeen(
  row: { id: string; dedupe_key: string },
  seen: ReadonlySet<string>,
): boolean {
  const id = row.id?.trim() ?? "";
  const canonical = scannerAlertToastKey(row);
  return seen.has(canonical) || (id !== "" && seen.has(id));
}

export function readSeenScannerToastKeys(userId: string): Set<string> {
  if (!userId.trim()) return new Set();
  try {
    const raw = sessionStorage.getItem(scannerAlertSessionStorageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((k) => typeof k === "string"));
  } catch {
    return new Set();
  }
}

export function readDurableSeenScannerToastKeys(userId: string, nowMs = Date.now()): Set<string> {
  return readAccountToastHistory(DURABLE_STORAGE_NAMESPACE, userId, {
    nowMs,
    maxAgeMs: SCANNER_ALERT_TOAST_LOOKBACK_MS,
    maxEntries: DURABLE_MAX_ENTRIES,
  });
}

export function mergeScannerToastSeenKeys(userId: string, nowMs = Date.now()): Set<string> {
  return mergeToastSeenSets(
    readSeenScannerToastKeys(userId),
    readDurableSeenScannerToastKeys(userId, nowMs),
  );
}

export function markScannerToastSeen(userId: string, toastKey: string): void {
  if (!userId.trim()) return;
  const seen = readSeenScannerToastKeys(userId);
  seen.add(toastKey);
  const trimmed = [...seen].slice(-200);
  sessionStorage.setItem(scannerAlertSessionStorageKey(userId), JSON.stringify(trimmed));
}

export function markScannerToastSeenDurable(userId: string, toastKey: string, nowMs = Date.now()): void {
  markAccountToastHistory(DURABLE_STORAGE_NAMESPACE, userId, toastKey, {
    nowMs,
    maxAgeMs: SCANNER_ALERT_TOAST_LOOKBACK_MS,
    maxEntries: DURABLE_MAX_ENTRIES,
  });
}

export function filterUnseenScannerAlerts<T extends { id: string; dedupe_key: string }>(
  rows: T[],
  seen: Set<string>,
): T[] {
  const expandedSeen = expandScannerToastSeenAliases(rows, seen);
  return dedupeScannerAlertsByCanonicalIdentity(rows).filter(
    (row) => !isScannerAlertToastSeen(row, expandedSeen),
  );
}

export function filterLiveScannerAlertToasts<
  T extends { id: string; dedupe_key: string; created_at?: string; event_at: string },
>(rows: T[], seen: Set<string>, baselineMs: number, nowMs = Date.now()): T[] {
  return filterUnseenScannerAlerts(rows, seen).filter((row) =>
    shouldSurfaceScannerAlertToast(row, baselineMs, nowMs),
  );
}

export function filterScannerAlertToastBacklog<
  T extends { id: string; dedupe_key: string; created_at?: string; event_at: string },
>(rows: T[], seen: Set<string>, baselineMs: number, nowMs = Date.now()): T[] {
  return filterUnseenScannerAlerts(rows, seen).filter(
    (row) => !shouldSurfaceScannerAlertToast(row, baselineMs, nowMs),
  );
}
