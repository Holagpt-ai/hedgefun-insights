/**
 * Action Center feed evidence: observation times, dedupe, and session labels.
 * Reuses scanner alert freshness contracts (Batch 14); does not change toast delivery.
 */

import {
  dedupeScannerAlertsByCanonicalIdentity,
  isCanonicalScannerAlertDedupeKey,
  scannerAlertCanonicalToastKey,
} from "@/lib/scanner-alerts/canonical-event-identity";
import {
  isValidScannerAlertObservationMs,
  parseObservationMs,
} from "@/lib/scanner-alerts/observation-freshness";
import type { WatchlistAlertRow } from "@/types/action-center";
import type { ScannerIntelligenceAlertRow } from "@/types/scanner-intelligence-alert";
import { etStartOfDayMs } from "@/lib/catalyst/parsers";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export const ACTION_FEED_LOOKBACK_MS = DAY;
export const ACTION_FEED_NOW_WINDOW_MS = 6 * HOUR;

export type FeedTimestampProvenance =
  | "market_observation"
  | "scheduled"
  | "recorded_unverified"
  | "database_record";

export interface ResolvedFeedTimestamp {
  sortMs: number;
  provenance: FeedTimestampProvenance;
  /** When DB insert time differs from market observation (scanner). */
  insertedMs: number | null;
  allowNowBucket: boolean;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function easternCalendarDate(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

export function dedupeScannerAlertsForActionFeed(
  rows: readonly ScannerIntelligenceAlertRow[],
): ScannerIntelligenceAlertRow[] {
  const sorted = [...rows].sort(
    (a, b) => parseObservationMs(b.event_at) - parseObservationMs(a.event_at),
  );
  return dedupeScannerAlertsByCanonicalIdentity(sorted);
}

export function resolveScannerAlertFeedTimestamp(
  row: Pick<ScannerIntelligenceAlertRow, "event_at" | "created_at">,
  nowMs: number,
): ResolvedFeedTimestamp | null {
  const insertedMs = parseObservationMs(row.created_at);
  const eventRaw = row.event_at?.trim() ?? "";

  if (isNonEmptyString(eventRaw)) {
    const observationMs = parseObservationMs(eventRaw);
    if (!isValidScannerAlertObservationMs(observationMs, nowMs)) return null;
    if (nowMs - observationMs > ACTION_FEED_LOOKBACK_MS) return null;
    return {
      sortMs: observationMs,
      provenance: "market_observation",
      insertedMs: Number.isFinite(insertedMs) ? insertedMs : null,
      allowNowBucket: true,
    };
  }

  if (!Number.isFinite(insertedMs)) return null;
  if (nowMs - insertedMs > ACTION_FEED_LOOKBACK_MS) return null;
  return {
    sortMs: insertedMs,
    provenance: "recorded_unverified",
    insertedMs,
    allowNowBucket: false,
  };
}

export function resolveWatchlistAlertFeedTimestamp(
  row: Pick<WatchlistAlertRow, "event_time" | "created_at">,
  nowMs: number,
): ResolvedFeedTimestamp | null {
  const insertedMs = parseObservationMs(row.created_at);
  const eventRaw = row.event_time?.trim() ?? "";

  if (isNonEmptyString(eventRaw)) {
    const observationMs = parseObservationMs(eventRaw);
    if (!Number.isFinite(observationMs)) return null;
    if (observationMs > nowMs + 5 * 60_000) return null;
    if (nowMs - observationMs > ACTION_FEED_LOOKBACK_MS) return null;
    return {
      sortMs: observationMs,
      provenance: "market_observation",
      insertedMs: Number.isFinite(insertedMs) ? insertedMs : null,
      allowNowBucket: true,
    };
  }

  if (!Number.isFinite(insertedMs)) return null;
  if (nowMs - insertedMs > ACTION_FEED_LOOKBACK_MS) return null;
  return {
    sortMs: insertedMs,
    provenance: "database_record",
    insertedMs,
    allowNowBucket: false,
  };
}

export function watchlistScannerCanonicalLinkKey(alert: WatchlistAlertRow): string | null {
  const direct = alert.dedupe_key?.trim() ?? "";
  if (isCanonicalScannerAlertDedupeKey(direct)) return direct;
  const facts = alert.facts;
  if (!facts || typeof facts !== "object") return null;
  const record = facts as Record<string, unknown>;
  const linked =
    (typeof record.scanner_dedupe_key === "string" ? record.scanner_dedupe_key : null) ??
    (typeof record.scanner_alert_dedupe_key === "string" ? record.scanner_alert_dedupe_key : null);
  if (linked && isCanonicalScannerAlertDedupeKey(linked.trim())) return linked.trim();
  return null;
}

/** Suppress only when watchlist market_signal shares canonical scanner event identity. */
export function shouldSuppressWatchlistForScannerDuplicate(
  alert: WatchlistAlertRow,
  scannerCanonicalKeys: ReadonlySet<string>,
): boolean {
  if (alert.alert_type !== "market_signal") return false;
  const link = watchlistScannerCanonicalLinkKey(alert);
  if (!link) return false;
  return scannerCanonicalKeys.has(link);
}

export function buildScannerCanonicalKeySet(
  scannerAlerts: readonly ScannerIntelligenceAlertRow[],
): Set<string> {
  return new Set(
    dedupeScannerAlertsForActionFeed(scannerAlerts).map((row) =>
      scannerAlertCanonicalToastKey(row),
    ),
  );
}

export function countDistinctScannerAlertsForFocus(
  scannerAlerts: readonly ScannerIntelligenceAlertRow[],
  dismissedIds: ReadonlySet<string>,
  nowMs: number,
): number {
  const active = scannerAlerts.filter((row) => !dismissedIds.has(row.id));
  const deduped = dedupeScannerAlertsForActionFeed(active);
  return deduped.filter((row) => resolveScannerAlertFeedTimestamp(row, nowMs) !== null).length;
}

export function countWatchlistAlertsForSummary(
  alerts: readonly WatchlistAlertRow[],
  scannerAlerts: readonly ScannerIntelligenceAlertRow[],
  dismissedScannerIds: ReadonlySet<string>,
  nowMs: number,
): number {
  const scannerKeys = buildScannerCanonicalKeySet(
    scannerAlerts.filter((row) => !dismissedScannerIds.has(row.id)),
  );
  let count = 0;
  for (const alert of alerts) {
    if (shouldSuppressWatchlistForScannerDuplicate(alert, scannerKeys)) continue;
    if (resolveWatchlistAlertFeedTimestamp(alert, nowMs) === null) continue;
    count += 1;
  }
  return count;
}

export function pickActionFeedBucket(
  ms: number,
  nowMs: number,
  source: "recent" | "upcoming" | "open",
  allowNowBucket: boolean,
): "now" | "today" | "upcoming" | "open_position" {
  if (source === "open") return "open_position";
  const todayStart = etStartOfDayMs(nowMs);
  const isTodayEt = ms >= todayStart && ms < todayStart + DAY;

  if (source === "recent") {
    if (allowNowBucket && Math.abs(nowMs - ms) <= ACTION_FEED_NOW_WINDOW_MS) return "now";
    return "today";
  }
  if (isTodayEt) return "today";
  return "upcoming";
}

export function formatFeedTimestampLabel(
  ms: number,
  provenance: FeedTimestampProvenance,
  insertedMs: number | null,
): string {
  const observed = new Date(ms).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  if (provenance === "market_observation") {
    if (
      insertedMs !== null &&
      Number.isFinite(insertedMs) &&
      insertedMs - ms > 30 * 60_000
    ) {
      const recorded = new Date(insertedMs).toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `Observed ${observed} ET · DB recorded ${recorded} ET`;
    }
    return `${observed} ET · Market observation`;
  }
  if (provenance === "recorded_unverified") {
    return `${observed} ET · Observation time unverified`;
  }
  if (provenance === "database_record") {
    return `${observed} ET · Recorded time`;
  }
  return `${observed} ET`;
}

export interface VolumeLeaderSnapshotMeta {
  badgeLabel: string;
  detailLabel: string;
  priorSession: boolean;
}

export function resolveVolumeLeaderSnapshotMeta(
  rows: ReadonlyArray<{ provider_as_of?: string | null; updated_at?: string | null }>,
  nowMs: number,
): VolumeLeaderSnapshotMeta {
  let marketMs: number | null = null;
  let syncMs: number | null = null;
  for (const row of rows) {
    const provider = parseObservationMs(row.provider_as_of ?? null);
    if (Number.isFinite(provider) && (marketMs === null || provider > marketMs)) {
      marketMs = provider;
    }
    const updated = parseObservationMs(row.updated_at ?? null);
    if (Number.isFinite(updated) && (syncMs === null || updated > syncMs)) {
      syncMs = updated;
    }
  }

  const referenceMs = marketMs ?? syncMs;
  if (referenceMs === null) {
    return {
      badgeLabel: "Snapshot unverified",
      detailLabel: "Snapshot time unverified",
      priorSession: false,
    };
  }

  const todayEt = easternCalendarDate(nowMs);
  const snapshotEt = easternCalendarDate(referenceMs);
  const priorSession = snapshotEt !== todayEt;
  const ageMins = Math.max(0, Math.round((nowMs - referenceMs) / 60_000));

  if (marketMs !== null) {
    const marketLabel = new Date(marketMs).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    if (priorSession) {
      return {
        badgeLabel: `Prior session · ${snapshotEt}`,
        detailLabel: `Market snapshot ${marketLabel} ET (${snapshotEt})`,
        priorSession: true,
      };
    }
    const delayed = ageMins > 30;
    return {
      badgeLabel: delayed ? `Delayed · ${ageMins}m` : `Snapshot · ${ageMins}m`,
      detailLabel: `Market snapshot ${marketLabel} ET`,
      priorSession: false,
    };
  }

  return {
    badgeLabel: priorSession ? `Prior session · ${snapshotEt}` : "DB sync",
    detailLabel: "Snapshot time unverified · database sync only",
    priorSession,
  };
}
