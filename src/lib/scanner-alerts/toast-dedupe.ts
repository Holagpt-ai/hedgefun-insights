import {
  markAccountToastHistory,
  mergeToastSeenSets,
  readAccountToastHistory,
} from "@/lib/notifications/account-toast-history";
import { isAtOrAfterBaseline } from "@/lib/notifications/toast-notification-baseline";

const SESSION_STORAGE_PREFIX = "stocksist-scanner-alert-toasts-v1";
const DURABLE_STORAGE_NAMESPACE = "stocksist-scanner-alert-toasts-v2";
export const SCANNER_ALERT_TOAST_LOOKBACK_MS = 6 * 3600_000;
export const SCANNER_ALERT_TOAST_BASELINE_NS = "stocksist-scanner-alert-toast-baseline-v1";
const DURABLE_MAX_ENTRIES = 400;

/** Stable toast identity: persisted alert row id (distinct events keep distinct ids). */
export function scannerAlertToastKey(row: { id: string; dedupe_key: string }): string {
  return row.id.trim() || row.dedupe_key;
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
  return Date.parse(row.event_at);
}

export function shouldSurfaceScannerAlertToast(
  row: { created_at?: string; event_at: string },
  baselineMs: number,
): boolean {
  return isAtOrAfterBaseline(scannerAlertDeliveryMs(row), baselineMs);
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
  return rows.filter((row) => !seen.has(scannerAlertToastKey(row)));
}

export function filterLiveScannerAlertToasts<
  T extends { id: string; dedupe_key: string; created_at?: string; event_at: string },
>(rows: T[], seen: Set<string>, baselineMs: number): T[] {
  return filterUnseenScannerAlerts(rows, seen).filter((row) => shouldSurfaceScannerAlertToast(row, baselineMs));
}

export function filterScannerAlertToastBacklog<
  T extends { id: string; dedupe_key: string; created_at?: string; event_at: string },
>(rows: T[], seen: Set<string>, baselineMs: number): T[] {
  return filterUnseenScannerAlerts(rows, seen).filter(
    (row) => !shouldSurfaceScannerAlertToast(row, baselineMs),
  );
}
