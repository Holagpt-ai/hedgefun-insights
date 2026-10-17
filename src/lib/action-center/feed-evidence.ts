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

export function buildDismissedScannerCanonicalKeys(
  allRows: readonly ScannerIntelligenceAlertRow[],
  dismissedIds: ReadonlySet<string>,
): Set<string> {
  const keys = new Set<string>();
  for (const row of allRows) {
    if (dismissedIds.has(row.id)) {
      keys.add(scannerAlertCanonicalToastKey(row));
    }
  }
  return keys;
}

/** One dismissed DB row suppresses every row sharing that canonical scanner event. */
export function filterScannerAlertsExcludingDismissedCanonicalGroups(
  rows: readonly ScannerIntelligenceAlertRow[],
  allRowsForDismissMapping: readonly ScannerIntelligenceAlertRow[],
  dismissedIds: ReadonlySet<string>,
): ScannerIntelligenceAlertRow[] {
  const dismissedKeys = buildDismissedScannerCanonicalKeys(allRowsForDismissMapping, dismissedIds);
  if (dismissedKeys.size === 0) return [...rows];
  return rows.filter((row) => !dismissedKeys.has(scannerAlertCanonicalToastKey(row)));
}

export function dedupeScannerAlertsForActionFeed(
  rows: readonly ScannerIntelligenceAlertRow[],
  nowMs = Date.now(),
): ScannerIntelligenceAlertRow[] {
  const eligible = rows
    .map((row) => ({
      row,
      timing: resolveScannerAlertFeedTimestamp(row, nowMs),
    }))
    .filter(
      (
        item,
      ): item is { row: ScannerIntelligenceAlertRow; timing: ResolvedFeedTimestamp } =>
        item.timing !== null,
    );
  const sorted = eligible.sort((a, b) => b.timing.sortMs - a.timing.sortMs);
  return dedupeScannerAlertsByCanonicalIdentity(sorted.map((item) => item.row));
}

/** Feed-visible scanner alerts after canonical dismiss groups and timestamp validation. */
export function selectFeedEligibleScannerAlerts(
  scannerAlerts: readonly ScannerIntelligenceAlertRow[],
  dismissedIds: ReadonlySet<string>,
  nowMs: number,
): ScannerIntelligenceAlertRow[] {
  const active = filterScannerAlertsExcludingDismissedCanonicalGroups(
    scannerAlerts,
    scannerAlerts,
    dismissedIds,
  );
  return dedupeScannerAlertsForActionFeed(active, nowMs);
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

export function buildDisplayedScannerCanonicalKeySet(
  scannerAlerts: readonly ScannerIntelligenceAlertRow[],
  dismissedIds: ReadonlySet<string>,
  nowMs: number,
): Set<string> {
  return new Set(
    selectFeedEligibleScannerAlerts(scannerAlerts, dismissedIds, nowMs).map((row) =>
      scannerAlertCanonicalToastKey(row),
    ),
  );
}

export function countDistinctScannerAlertsForFocus(
  scannerAlerts: readonly ScannerIntelligenceAlertRow[],
  dismissedIds: ReadonlySet<string>,
  nowMs: number,
): number {
  return selectFeedEligibleScannerAlerts(scannerAlerts, dismissedIds, nowMs).length;
}

export function countWatchlistAlertsForSummary(
  alerts: readonly WatchlistAlertRow[],
  scannerAlerts: readonly ScannerIntelligenceAlertRow[],
  dismissedScannerIds: ReadonlySet<string>,
  nowMs: number,
): number {
  const scannerKeys = buildDisplayedScannerCanonicalKeySet(
    scannerAlerts,
    dismissedScannerIds,
    nowMs,
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
  mixedAge: boolean;
}

export type VolumeLeaderMarketAge =
  | "current_session"
  | "prior_session"
  | "unverified"
  | "invalid_future";

type ScreenerLeaderLike = { provider_as_of?: string | null };

export interface VolumeLeaderRowSnapshot {
  kind: VolumeLeaderMarketAge;
  shortLabel: string;
  detailLabel: string;
}

export function resolveVolumeLeaderRowSnapshot(
  row: ScreenerLeaderLike,
  nowMs: number,
): VolumeLeaderRowSnapshot {
  const raw = row.provider_as_of?.trim() ?? "";
  if (!raw) {
    return {
      kind: "unverified",
      shortLabel: "Snap unverified",
      detailLabel: "Market snapshot time unverified",
    };
  }
  const ms = parseObservationMs(raw);
  if (!isValidScannerAlertObservationMs(ms, nowMs)) {
    return {
      kind: "invalid_future",
      shortLabel: "Snap invalid",
      detailLabel: "Market snapshot timestamp invalid or future-dated",
    };
  }
  const todayEt = easternCalendarDate(nowMs);
  const snapEt = easternCalendarDate(ms);
  if (snapEt !== todayEt) {
    return {
      kind: "prior_session",
      shortLabel: `Prior ${snapEt}`,
      detailLabel: `Prior-session market snapshot (${snapEt})`,
    };
  }
  const ageMins = Math.max(0, Math.round((nowMs - ms) / 60_000));
  return {
    kind: "current_session",
    shortLabel: ageMins > 30 ? `Delayed ${ageMins}m` : `${ageMins}m snap`,
    detailLabel: `Current-session market snapshot · ${ageMins}m ago`,
  };
}

export function resolveVolumeLeaderListSnapshotMeta(
  rows: ReadonlyArray<ScreenerLeaderLike>,
  nowMs: number,
): VolumeLeaderSnapshotMeta {
  if (rows.length === 0) {
    return {
      badgeLabel: "Snapshot unverified",
      detailLabel: "Snapshot time unverified",
      priorSession: false,
      mixedAge: false,
    };
  }

  const rowSnapshots = rows.map((row) => resolveVolumeLeaderRowSnapshot(row, nowMs));
  const kinds = new Set(rowSnapshots.map((snap) => snap.kind));

  if (kinds.size > 1) {
    return {
      badgeLabel: "Mixed-age snapshots",
      detailLabel: "Rows span different market snapshot ages. See per-symbol labels.",
      priorSession: rowSnapshots.some((snap) => snap.kind === "prior_session"),
      mixedAge: true,
    };
  }

  const onlyKind = rowSnapshots[0]?.kind ?? "unverified";
  if (onlyKind === "unverified") {
    return {
      badgeLabel: "Snapshot unverified",
      detailLabel: "Market snapshot time unverified for all listed symbols",
      priorSession: false,
      mixedAge: false,
    };
  }
  if (onlyKind === "invalid_future") {
    return {
      badgeLabel: "Snapshot invalid",
      detailLabel: "Market snapshot timestamps invalid or future-dated",
      priorSession: false,
      mixedAge: false,
    };
  }
  if (onlyKind === "prior_session") {
    const dates = rows
      .map((row) => {
        const ms = parseObservationMs(row.provider_as_of ?? null);
        return Number.isFinite(ms) ? easternCalendarDate(ms) : null;
      })
      .filter(Boolean);
    const label = dates[0] ?? "prior";
    return {
      badgeLabel: `Prior session · ${label}`,
      detailLabel: "All listed symbols use prior-session market snapshots",
      priorSession: true,
      mixedAge: false,
    };
  }

  let oldestMs = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const ms = parseObservationMs(row.provider_as_of ?? null);
    if (Number.isFinite(ms)) oldestMs = Math.min(oldestMs, ms);
  }
  const ageMins =
    Number.isFinite(oldestMs) && oldestMs !== Number.POSITIVE_INFINITY
      ? Math.max(0, Math.round((nowMs - oldestMs) / 60_000))
      : null;
  return {
    badgeLabel: ageMins === null ? "Snapshot unverified" : `Snapshot · oldest ${ageMins}m`,
    detailLabel:
      ageMins === null
        ? "Current-session snapshot age unavailable"
        : `Current-session snapshots span up to ${ageMins}m (oldest listed symbol)`,
    priorSession: false,
    mixedAge: false,
  };
}

/** @deprecated Use resolveVolumeLeaderListSnapshotMeta — never certifies freshness from DB updated_at. */
export function resolveVolumeLeaderSnapshotMeta(
  rows: ReadonlyArray<ScreenerLeaderLike>,
  nowMs: number,
): VolumeLeaderSnapshotMeta {
  return resolveVolumeLeaderListSnapshotMeta(rows, nowMs);
}
