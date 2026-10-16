/** In-app toast lookback for price-alert trigger events (matches dashboard listener). */
import {
  markAccountToastHistory,
  mergeToastSeenSets,
  readAccountToastHistory,
} from "@/lib/notifications/account-toast-history";
import { isAtOrAfterBaseline } from "@/lib/notifications/toast-notification-baseline";

export const PRICE_ALERT_TOAST_LOOKBACK_MS = 24 * 3600_000;
export const PRICE_ALERT_MAX_FUTURE_SKEW_MS = 5 * 60_000;
/** Live popup max age (delayed feed + transport); query window stays 24h. */
export const PRICE_ALERT_LIVE_POPUP_MAX_AGE_MS = 15 * 60_000 + 45 * 60_000;
export const PRICE_ALERT_TOAST_BASELINE_NS = "stocksist-price-alert-toast-baseline-v1";

const SESSION_STORAGE_PREFIX = "stocksist-price-alert-toasts-v1";
const DURABLE_STORAGE_NAMESPACE = "stocksist-price-alert-toasts-v2";
const DURABLE_MAX_ENTRIES = 400;

export type PriceAlertTriggerToastRow = {
  id: string;
  delivery_status: string;
  seen_at: string | null;
  triggered_at?: string;
};

export function priceAlertSessionStorageKey(userId: string): string {
  return `${SESSION_STORAGE_PREFIX}:${userId.trim()}`;
}

export function priceAlertToastSinceIso(nowMs: number): string {
  return new Date(nowMs - PRICE_ALERT_TOAST_LOOKBACK_MS).toISOString();
}

/** Server-side: delivered to in-app channel but user has not been notified yet. */
export function isPriceAlertToastPending(row: PriceAlertTriggerToastRow): boolean {
  return row.delivery_status === "delivered" && row.seen_at == null;
}

/** Market observation time (not toast delivery time). */
export function priceAlertObservationMs(row: Pick<PriceAlertTriggerToastRow, "triggered_at">): number {
  return Date.parse(row.triggered_at ?? "");
}

export function isValidPriceAlertObservationMs(observationMs: number, nowMs: number): boolean {
  if (!Number.isFinite(observationMs)) return false;
  if (observationMs > nowMs + PRICE_ALERT_MAX_FUTURE_SKEW_MS) return false;
  return true;
}

export function isWithinPriceAlertQueryLookbackMs(observationMs: number, nowMs: number): boolean {
  if (!isValidPriceAlertObservationMs(observationMs, nowMs)) return false;
  return nowMs - observationMs <= PRICE_ALERT_TOAST_LOOKBACK_MS;
}

export function isWithinPriceAlertLivePopupAgeMs(observationMs: number, nowMs: number): boolean {
  if (!isValidPriceAlertObservationMs(observationMs, nowMs)) return false;
  return nowMs - observationMs <= PRICE_ALERT_LIVE_POPUP_MAX_AGE_MS;
}

/** @deprecated Use isValid + live/query helpers. */
export function isPlausiblePriceAlertObservationMs(observationMs: number, nowMs: number): boolean {
  return isWithinPriceAlertQueryLookbackMs(observationMs, nowMs);
}

/** Live popup: pending, not yet seen locally, and observation is not pre-baseline backlog. */
export function shouldSurfacePriceAlertToast(
  row: PriceAlertTriggerToastRow,
  baselineMs: number,
  nowMs = Date.now(),
): boolean {
  if (!isPriceAlertToastPending(row)) return false;
  const observedMs = priceAlertObservationMs(row);
  if (!isValidPriceAlertObservationMs(observedMs, nowMs)) return false;
  if (!isWithinPriceAlertLivePopupAgeMs(observedMs, nowMs)) return false;
  return isAtOrAfterBaseline(observedMs, baselineMs);
}

/**
 * Triggers that should surface as a popup: undelivered-to-user (seen_at null),
 * with session + durable dedupe while seen_at persistence is in flight or failed.
 */
export function filterPriceAlertToastCandidates<T extends PriceAlertTriggerToastRow & { id: string }>(
  rows: T[],
  sessionSeenIds: ReadonlySet<string>,
  options?: { baselineMs?: number; nowMs?: number },
): T[] {
  const deduped = dedupePriceAlertTriggersById(rows);
  const baselineMs = options?.baselineMs;
  const nowMs = options?.nowMs ?? Date.now();
  return deduped.filter((row) => {
    if (sessionSeenIds.has(row.id)) return false;
    if (baselineMs == null) return isPriceAlertToastPending(row);
    return shouldSurfacePriceAlertToast(row, baselineMs, nowMs);
  });
}

/** Pending rows that should be marked seen locally without a popup (historical backlog). */
export function filterPriceAlertToastBacklog<T extends PriceAlertTriggerToastRow & { id: string }>(
  rows: T[],
  sessionSeenIds: ReadonlySet<string>,
  baselineMs: number,
  nowMs = Date.now(),
): T[] {
  const deduped = dedupePriceAlertTriggersById(rows);
  return deduped.filter((row) => {
    if (sessionSeenIds.has(row.id)) return false;
    if (!isPriceAlertToastPending(row)) return false;
    return !shouldSurfacePriceAlertToast(row, baselineMs, nowMs);
  });
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

export function readSeenPriceAlertToastIds(userId: string): Set<string> {
  if (!userId.trim()) return new Set();
  try {
    const raw = sessionStorage.getItem(priceAlertSessionStorageKey(userId));
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
  return mergeToastSeenSets(
    readSeenPriceAlertToastIds(userId),
    readDurableSeenPriceAlertToastIds(userId, nowMs),
  );
}

export function markPriceAlertToastSeenInSession(userId: string, triggerId: string): void {
  if (!userId.trim()) return;
  const seen = readSeenPriceAlertToastIds(userId);
  seen.add(triggerId);
  const trimmed = [...seen].slice(-200);
  sessionStorage.setItem(priceAlertSessionStorageKey(userId), JSON.stringify(trimmed));
}

/** Persist acknowledgment locally even when seen_at update fails or the tab reloads. */
export function markPriceAlertToastSeenDurable(userId: string, triggerId: string, nowMs = Date.now()): void {
  markAccountToastHistory(DURABLE_STORAGE_NAMESPACE, userId, triggerId, {
    nowMs,
    maxAgeMs: PRICE_ALERT_TOAST_LOOKBACK_MS,
    maxEntries: DURABLE_MAX_ENTRIES,
  });
}
