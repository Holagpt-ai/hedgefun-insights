import {
  markAccountToastHistory,
  mergeToastSeenSets,
  readAccountToastHistory,
} from "@/lib/notifications/account-toast-history";

const SESSION_STORAGE_KEY = "stocksist-scanner-alert-toasts-v1";
const DURABLE_STORAGE_NAMESPACE = "stocksist-scanner-alert-toasts-v2";
const SCANNER_TOAST_LOOKBACK_MS = 6 * 3600_000;
const DURABLE_MAX_ENTRIES = 400;

/** Stable toast identity: persisted alert row id (distinct events keep distinct ids). */
export function scannerAlertToastKey(row: { id: string; dedupe_key: string }): string {
  return row.id.trim() || row.dedupe_key;
}

export function readSeenScannerToastKeys(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
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
    maxAgeMs: SCANNER_TOAST_LOOKBACK_MS,
    maxEntries: DURABLE_MAX_ENTRIES,
  });
}

export function mergeScannerToastSeenKeys(userId: string, nowMs = Date.now()): Set<string> {
  return mergeToastSeenSets(readSeenScannerToastKeys(), readDurableSeenScannerToastKeys(userId, nowMs));
}

export function markScannerToastSeen(toastKey: string): void {
  const seen = readSeenScannerToastKeys();
  seen.add(toastKey);
  const trimmed = [...seen].slice(-200);
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(trimmed));
}

export function markScannerToastSeenDurable(userId: string, toastKey: string, nowMs = Date.now()): void {
  markAccountToastHistory(DURABLE_STORAGE_NAMESPACE, userId, toastKey, {
    nowMs,
    maxAgeMs: SCANNER_TOAST_LOOKBACK_MS,
    maxEntries: DURABLE_MAX_ENTRIES,
  });
}

export function filterUnseenScannerAlerts<T extends { id: string; dedupe_key: string }>(
  rows: T[],
  seen: Set<string>,
): T[] {
  return rows.filter((row) => !seen.has(scannerAlertToastKey(row)));
}
