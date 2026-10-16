/** In-app toast lookback for price-alert trigger events (matches dashboard listener). */
import {
  markAccountToastHistory,
  mergeToastSeenSets,
  readAccountToastHistory,
} from "@/lib/notifications/account-toast-history";

export const PRICE_ALERT_TOAST_LOOKBACK_MS = 24 * 3600_000;

const SESSION_STORAGE_KEY = "stocksist-price-alert-toasts-v1";
const DURABLE_STORAGE_NAMESPACE = "stocksist-price-alert-toasts-v2";
const DURABLE_MAX_ENTRIES = 400;

export type PriceAlertTriggerToastRow = {
  id: string;
  delivery_status: string;
  seen_at: string | null;
};

export function priceAlertToastSinceIso(nowMs: number): string {
  return new Date(nowMs - PRICE_ALERT_TOAST_LOOKBACK_MS).toISOString();
}

/** Server-side: delivered to in-app channel but user has not been notified yet. */
export function isPriceAlertToastPending(row: PriceAlertTriggerToastRow): boolean {
  return row.delivery_status === "delivered" && row.seen_at == null;
}

/**
 * Triggers that should surface as a popup: undelivered-to-user (seen_at null),
 * with session + durable dedupe while seen_at persistence is in flight or failed.
 */
export function filterPriceAlertToastCandidates<T extends PriceAlertTriggerToastRow & { id: string }>(
  rows: T[],
  sessionSeenIds: ReadonlySet<string>,
): T[] {
  const deduped = dedupePriceAlertTriggersById(rows);
  return deduped.filter(
    (row) => isPriceAlertToastPending(row) && !sessionSeenIds.has(row.id),
  );
}

export function dedupePriceAlertTriggersById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

export function readSeenPriceAlertToastIds(): Set<string> {
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

export function readDurableSeenPriceAlertToastIds(userId: string, nowMs = Date.now()): Set<string> {
  return readAccountToastHistory(DURABLE_STORAGE_NAMESPACE, userId, {
    nowMs,
    maxAgeMs: PRICE_ALERT_TOAST_LOOKBACK_MS,
    maxEntries: DURABLE_MAX_ENTRIES,
  });
}

export function mergePriceAlertToastSeenIds(userId: string, nowMs = Date.now()): Set<string> {
  return mergeToastSeenSets(readSeenPriceAlertToastIds(), readDurableSeenPriceAlertToastIds(userId, nowMs));
}

export function markPriceAlertToastSeenInSession(triggerId: string): void {
  const seen = readSeenPriceAlertToastIds();
  seen.add(triggerId);
  const trimmed = [...seen].slice(-200);
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(trimmed));
}

/** Persist acknowledgment locally even when seen_at update fails or the tab reloads. */
export function markPriceAlertToastSeenDurable(userId: string, triggerId: string, nowMs = Date.now()): void {
  markAccountToastHistory(DURABLE_STORAGE_NAMESPACE, userId, triggerId, {
    nowMs,
    maxAgeMs: PRICE_ALERT_TOAST_LOOKBACK_MS,
    maxEntries: DURABLE_MAX_ENTRIES,
  });
}
