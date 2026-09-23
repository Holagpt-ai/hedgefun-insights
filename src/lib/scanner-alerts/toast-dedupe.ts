const STORAGE_KEY = "stocksist-scanner-alert-toasts-v1";

export function scannerAlertToastKey(dedupeKey: string): string {
  return dedupeKey;
}

export function readSeenScannerToastKeys(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((k) => typeof k === "string"));
  } catch {
    return new Set();
  }
}

export function markScannerToastSeen(dedupeKey: string): void {
  const seen = readSeenScannerToastKeys();
  seen.add(dedupeKey);
  const trimmed = [...seen].slice(-200);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

export function filterUnseenScannerAlerts<T extends { dedupe_key: string }>(
  rows: T[],
  seen: Set<string>,
): T[] {
  return rows.filter((row) => !seen.has(scannerAlertToastKey(row.dedupe_key)));
}
