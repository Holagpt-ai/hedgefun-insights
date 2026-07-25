// Pure helpers for the Action Center. No React, no fetching. Safe to test.
import type {
  ActionFeedItem,
  FeedBucket,
  FocusTask,
  OpenTradeRow,
  SummaryCounts,
  WatchlistAlertRow,
  WatchlistAnalysisRow,
  WatchlistSnapshot,
} from "@/types/action-center";
import type { CatalystEvent, CatalystUserStateRow } from "@/types/catalyst";
import { eventMomentMs, etStartOfDayMs, scheduledMomentMs } from "@/lib/catalyst/parsers";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** ET boundary: before 16:00 ET => 'am', otherwise 'pm'. */
export function resolveBriefType(nowMs: number): "am" | "pm" {
  const et = new Date(
    new Date(nowMs).toLocaleString("en-US", { timeZone: "America/New_York" }),
  );
  return et.getHours() < 16 ? "am" : "pm";
}

/** Only rows with valid_through > now are current. */
export function isCurrent(row: WatchlistAnalysisRow, nowMs: number): boolean {
  const t = Date.parse(row.valid_through);
  return Number.isFinite(t) && t > nowMs;
}

export function watchlistSnapshot(
  rows: WatchlistAnalysisRow[],
  nowMs: number,
): WatchlistSnapshot {
  const snap: WatchlistSnapshot = {
    bullish: 0,
    bearish: 0,
    neutral: 0,
    dataUnavailable: 0,
    awaitingRefresh: 0,
  };
  const seen = new Set<string>();
  for (const r of rows) {
    const t = r.ticker?.toUpperCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    if (!isCurrent(r, nowMs)) {
      snap.awaitingRefresh += 1;
      continue;
    }
    switch (r.direction) {
      case "bullish": snap.bullish += 1; break;
      case "bearish": snap.bearish += 1; break;
      case "neutral": snap.neutral += 1; break;
      case "data_unavailable": snap.dataUnavailable += 1; break;
    }
  }
  return snap;
}

/**
 * Classify a catalyst event against the current ET clock.
 * - Date-only events on today's ET calendar day remain "scheduled" for the
 *   entire ET day (independent of runtime timezone / UTC crossings).
 * - Timed events (event_time) are "scheduled" only while still in the future.
 * - Otherwise a published event within the past 72h is "recent".
 */
export function classifyCatalyst(
  e: { event_time?: string | null; event_date?: string | null; published_at?: string | null },
  nowMs: number,
): { kind: "scheduled" | "recent"; ms: number } | null {
  const todayStart = etStartOfDayMs(nowMs);
  const upcomingEnd = todayStart + 8 * DAY; // today + next 7 ET calendar days
  const s = scheduledMomentMs(e);
  if (s !== null) {
    const lower = e.event_time ? nowMs : todayStart;
    if (s >= lower && s < upcomingEnd) return { kind: "scheduled", ms: s };
  }
  const p = eventMomentMs(e);
  if (p !== null && p < nowMs && p >= nowMs - 72 * HOUR) return { kind: "recent", ms: p };
  return null;
}

export function summaryCounts(input: {
  alerts: WatchlistAlertRow[];
  analyses: WatchlistAnalysisRow[];
  catalyst: CatalystEvent[];
  openTrades: OpenTradeRow[];
  nowMs: number;
}): SummaryCounts {
  const { alerts, analyses, catalyst, openTrades, nowMs } = input;
  const cutoff = nowMs - 24 * HOUR;
  const alertCount = alerts.filter((a) => {
    const t = Date.parse(a.created_at);
    return Number.isFinite(t) && t >= cutoff;
  }).length;

  const unusualTickers = new Set<string>();
  for (const r of analyses) {
    if (!isCurrent(r, nowMs)) continue;
    if (r.rvol_class === "unusual" && r.ticker) unusualTickers.add(r.ticker.toUpperCase());
  }

  const seenEventIds = new Set<string>();
  for (const e of catalyst) {
    if (e.verification_state !== "provider_reported") continue;
    if (seenEventIds.has(e.id)) continue;
    if (!classifyCatalyst(e, nowMs)) continue;
    seenEventIds.add(e.id);
  }

  return {
    watchlistAlerts: alertCount,
    unusualActivity: unusualTickers.size,
    catalystEvents: seenEventIds.size,
    openTrades: openTrades.filter((t) => t.status === "open").length,
  };
}

function humanAlertType(t: string): string {
  switch (t) {
    case "direction_change": return "Direction change";
    case "unusual_volume": return "Unusual volume";
    case "market_signal": return "Market signal";
    case "company_event": return "Company event";
    case "earnings_upcoming": return "Earnings upcoming";
    default: return t.replace(/_/g, " ");
  }
}

function fmtEt(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function fmtEtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      timeZone: "America/New_York",
      month: "short", day: "numeric", year: "numeric",
    });
  } catch { return iso; }
}

function pickBucket(ms: number, nowMs: number, source: "recent" | "upcoming" | "open"): FeedBucket {
  if (source === "open") return "open_position";
  const todayStart = etStartOfDayMs(nowMs);
  const isTodayEt = ms >= todayStart && ms < todayStart + DAY;

  if (source === "recent") {
    if (Math.abs(nowMs - ms) <= 6 * HOUR) return "now";
    return "today";
  }
  // upcoming (scheduled catalyst)
  if (isTodayEt) return "today";
  return "upcoming";
}

export function buildActionFeed(input: {
  alerts: WatchlistAlertRow[];
  catalyst: CatalystEvent[];
  savedEventIds: Set<string>;
  reviewedEventIds: Set<string>;
  openTrades: OpenTradeRow[];
  nowMs: number;
}): ActionFeedItem[] {
  const { alerts, catalyst, savedEventIds, reviewedEventIds, openTrades, nowMs } = input;
  const items: ActionFeedItem[] = [];

  for (const a of alerts) {
    const ms = Date.parse(a.event_time) || Date.parse(a.created_at);
    if (!Number.isFinite(ms)) continue;
    if (nowMs - ms > 24 * HOUR) continue;
    items.push({
      key: `alert:${a.id}`,
      bucket: pickBucket(ms, nowMs, "recent"),
      source: "watchlist_alert",
      symbol: a.ticker.toUpperCase(),
      title: humanAlertType(a.alert_type),
      detail: a.reason || null,
      timestampMs: ms,
      timestampLabel: fmtEt(new Date(ms).toISOString()),
      sourceLabel: "Watchlist alert",
    });
  }

  // Saved-but-unreviewed catalyst events
  for (const e of catalyst) {
    if (e.verification_state !== "provider_reported") continue;
    if (!savedEventIds.has(e.id) || reviewedEventIds.has(e.id)) continue;
    const c = classifyCatalyst(e, nowMs);
    if (!c) continue;
    const isUpcoming = c.kind === "scheduled";
    items.push({
      key: `saved:${e.id}`,
      bucket: pickBucket(c.ms, nowMs, isUpcoming ? "upcoming" : "recent"),
      source: "catalyst_saved",
      symbol: e.symbol.toUpperCase(),
      title: `Saved: ${e.title}`,
      detail: e.source_name ? `${e.source_name}` : null,
      timestampMs: c.ms,
      timestampLabel: isUpcoming ? fmtEtDate(e.event_date) : fmtEt(e.published_at ?? new Date(c.ms).toISOString()),
      sourceLabel: "Catalyst · Saved",
      eventId: e.id,
      sourceUrl: e.source_url,
    });
  }

  // Upcoming catalyst (today + next 7 ET days) — de-dup with saved
  const savedKeys = new Set(items.filter((i) => i.source === "catalyst_saved").map((i) => i.eventId));
  for (const e of catalyst) {
    if (e.verification_state !== "provider_reported") continue;
    if (savedKeys.has(e.id)) continue;
    const c = classifyCatalyst(e, nowMs);
    if (!c || c.kind !== "scheduled") continue;
    items.push({
      key: `upcoming:${e.id}`,
      bucket: pickBucket(c.ms, nowMs, "upcoming"),
      source: "catalyst_upcoming",
      symbol: e.symbol.toUpperCase(),
      title: e.title,
      detail: e.source_name || null,
      timestampMs: c.ms,
      timestampLabel: fmtEtDate(e.event_date),
      sourceLabel: "Catalyst · Upcoming",
      eventId: e.id,
      sourceUrl: e.source_url,
    });
  }

  for (const t of openTrades) {
    if (t.status !== "open") continue;
    const ms = Date.parse(t.entry_date);
    if (!Number.isFinite(ms)) continue;
    items.push({
      key: `trade:${t.id}`,
      bucket: "open_position",
      source: "open_trade",
      symbol: t.symbol.toUpperCase(),
      title: `${t.side === "long" ? "Long" : "Short"} ${t.qty} @ ${t.entry_price}`,
      detail: [
        `Entered ${fmtEtDate(t.entry_date)}`,
        t.stop_price != null ? `Stop ${t.stop_price}` : null,
        t.target_price != null ? `Target ${t.target_price}` : null,
      ].filter(Boolean).join(" · "),
      timestampMs: ms,
      timestampLabel: fmtEtDate(t.entry_date),
      sourceLabel: "Journal · Open",
    });
  }

  // Sort within buckets
  const order: FeedBucket[] = ["now", "today", "upcoming", "open_position"];
  items.sort((a, b) => {
    const ao = order.indexOf(a.bucket);
    const bo = order.indexOf(b.bucket);
    if (ao !== bo) return ao - bo;
    // upcoming: nearest first (ascending); others: newest first (descending)
    if (a.bucket === "upcoming") return a.timestampMs - b.timestampMs;
    return b.timestampMs - a.timestampMs;
  });
  return items;
}

export function buildFocusTasks(input: {
  summary: SummaryCounts;
  savedUnreviewedCount: number;
}): FocusTask[] {
  const out: FocusTask[] = [];
  if (input.summary.watchlistAlerts > 0) {
    out.push({ id: "alerts", label: "Review new Watchlist alerts", count: input.summary.watchlistAlerts, route: "/dashboard/watchlist" });
  }
  if (input.summary.unusualActivity > 0) {
    out.push({ id: "unusual", label: "Review unusual-volume Watchlist names", count: input.summary.unusualActivity, route: "/dashboard/watchlist" });
  }
  if (input.savedUnreviewedCount > 0) {
    out.push({ id: "saved", label: "Review saved Catalyst events", count: input.savedUnreviewedCount, route: "/dashboard/catalyst" });
  }
  if (input.summary.openTrades > 0) {
    out.push({ id: "open", label: "Review open trades and recorded risk levels", count: input.summary.openTrades, route: "/dashboard/journal" });
  }
  return out;
}

/** Group upcoming (nearest first) + recent (newest first) for Catalyst Watch, cap N. */
export function catalystWatchList(events: CatalystEvent[], nowMs: number, limit = 6): CatalystEvent[] {
  const provider = events.filter((e) => e.verification_state === "provider_reported");
  const todayStart = etStartOfDayMs(nowMs);
  const upcomingEnd = todayStart + 8 * DAY;
  const upcoming = provider
    .filter((e) => {
      const s = scheduledMomentMs(e);
      return s !== null && s >= todayStart && s < upcomingEnd;
    })
    .sort((a, b) => (scheduledMomentMs(a) ?? 0) - (scheduledMomentMs(b) ?? 0));
  const upcomingIds = new Set(upcoming.map((e) => e.id));
  const recent = provider
    .filter((e) => {
      if (upcomingIds.has(e.id)) return false;
      const m = eventMomentMs(e);
      return m !== null && m < nowMs && m >= nowMs - 72 * HOUR;
    })
    .sort((a, b) => (eventMomentMs(b) ?? 0) - (eventMomentMs(a) ?? 0));
  const seen = new Set<string>();
  const out: CatalystEvent[] = [];
  for (const e of [...upcoming, ...recent]) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    out.push(e);
    if (out.length >= limit) break;
  }
  return out;
}

export function savedUnreviewedCount(
  events: CatalystEvent[],
  userState: CatalystUserStateRow[],
): number {
  const saved = new Set(userState.filter((u) => u.saved_at).map((u) => u.event_id));
  const reviewed = new Set(userState.filter((u) => u.reviewed_at).map((u) => u.event_id));
  let n = 0;
  const seen = new Set<string>();
  for (const e of events) {
    if (e.verification_state !== "provider_reported") continue;
    if (!saved.has(e.id) || reviewed.has(e.id)) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    n += 1;
  }
  return n;
}
