// Pure, dependency-free helpers for the Pre-Market workspace aggregator.
// No network, no Supabase, no Deno APIs → fully unit-testable.
//
// Session/calendar hardening reuses the locked Watchlist V2 implementation
// (`_shared/watchlist-v2/session.ts`) read-only; it is never modified here.

import {
  classifyToday,
  extractEtOffset,
  type UpcomingRow,
} from "../watchlist-v2/session.ts";

export type { UpcomingRow };


export type SectionStatus = "available" | "empty" | "stale" | "unavailable";

export interface SectionEnvelope<T> {
  status: SectionStatus;
  data: T;
  as_of: string | null;
  reason_code: string | null;
}

export type ReasonCode =
  | "NO_QUALIFYING_DATA"
  | "SOURCE_STALE"
  | "QUERY_FAILED"
  | "CALENDAR_UNAVAILABLE"
  | "CALENDAR_CONTRADICTORY"
  | "PROVIDER_TIME_INVALID"
  | "NON_TRADING_DAY"
  | "OUTSIDE_PREMARKET"
  | "WATCHLIST_EMPTY"
  | "ANALYSIS_AWAITING_REFRESH"
  | "NEWS_FEED_EMPTY"
  | "INCOMPLETE_COVERAGE"
  | "SOURCE_UNVERIFIABLE";

export type MarketContextStatus =
  | "premarket"
  | "regular"
  | "afterhours"
  | "closed"
  | "non_trading_day"
  | "unavailable";

export const CONTRACT_VERSION = 1 as const;

/** Freshness thresholds (minutes) applied only during an active session. */
export const INDEX_STALE_MINUTES = 20;
export const SCREENER_STALE_MINUTES = 30;

export function envelope<T>(
  status: SectionStatus,
  data: T,
  as_of: string | null = null,
  reason_code: string | null = null,
): SectionEnvelope<T> {
  return { status, data, as_of, reason_code };
}

export function unavailableSection<T>(empty: T, reason: ReasonCode = "QUERY_FAILED"): SectionEnvelope<T> {
  return envelope(("unavailable" as SectionStatus), empty, null, reason);
}

export function emptySection<T>(empty: T, reason: ReasonCode = "NO_QUALIFYING_DATA"): SectionEnvelope<T> {
  return envelope(("empty" as SectionStatus), empty, null, reason);
}

// ---------------------------------------------------------------- ET helpers

export interface EtParts {
  date: string;
  weekday: string;
  hour: number;
  minute: number;
  minutes: number;
}

export function etParts(now: Date = new Date()): EtParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
    minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  };
}

export function isWeekend(weekday: string): boolean {
  return weekday === "Sat" || weekday === "Sun";
}

export function etTimeLabel(p: EtParts): string {
  const hh = String(p.hour).padStart(2, "0");
  const mm = String(p.minute).padStart(2, "0");
  return `${hh}:${mm}`;
}

// -------------------------------------------------------------- validation

export const TICKER_REGEX = /^[A-Z][A-Z0-9.-]{0,14}$/;

export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  return TICKER_REGEX.test(t) ? t : null;
}

/** Finite number or null — never coerces missing values to 0. */
export function finiteOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? (n as number) : null;
}

export function positiveOrNull(v: unknown): number | null {
  const n = finiteOrNull(v);
  return n !== null && n > 0 ? n : null;
}

export function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? v : null;
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function ageMinutes(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (nowMs - t) / 60000;
}

export function isActiveSession(status: MarketContextStatus): boolean {
  return status === "premarket" || status === "regular" || status === "afterhours";
}

// ------------------------------------------------------------ market status

export interface MarketNowResponse {
  market?: string;
  earlyHours?: boolean;
  afterHours?: boolean;
  serverTime?: string;
}

/**
 * Map a Polygon /v1/marketstatus/now payload to our closed status set.
 * Fails closed to "unavailable" for malformed data.
 */
export function mapMarketStatus(
  body: unknown,
  opts: { weekday: string; upcomingClosedToday: boolean },
): MarketContextStatus {
  if (opts.upcomingClosedToday) return "non_trading_day";
  if (isWeekend(opts.weekday)) return "non_trading_day";
  if (!body || typeof body !== "object" || Array.isArray(body)) return "unavailable";
  const b = body as MarketNowResponse;
  const market = typeof b.market === "string" ? b.market.toLowerCase() : null;
  if (market === null) return "unavailable";
  if (b.earlyHours === true) return "premarket";
  if (b.afterHours === true) return "afterhours";
  if (market === "open") return "regular";
  if (market === "closed" || market === "extended-hours") return "closed";
  return "unavailable";
}

// --------------------------------------------------------- watchlist gating

export interface RawAnalysis {
  ticker?: unknown;
  session_type?: unknown;
  session_date?: unknown;
  valid_through?: unknown;
  direction?: unknown;
}

/**
 * A Watchlist V2 analysis row counts as *current pre-market activity* only
 * when it is a premarket row, for today's ET session date, still valid.
 */
export function isCurrentPremarketAnalysis(
  row: RawAnalysis,
  etDate: string,
  nowMs: number,
): boolean {
  if (row.session_type !== "premarket") return false;
  if (!isIsoDate(row.session_date) || row.session_date !== etDate) return false;
  const vt = isoOrNull(row.valid_through);
  if (!vt) return false;
  return Date.parse(vt) > nowMs;
}

/** volume DESC, null volume last, |change%| DESC as deterministic tie-break. */
export function compareByVolumeDesc(
  a: { volume: number | null; change_pct?: number | null },
  b: { volume: number | null; change_pct?: number | null },
): number {
  const av = a.volume, bv = b.volume;
  if (av === null && bv === null) {
    return Math.abs(b.change_pct ?? 0) - Math.abs(a.change_pct ?? 0);
  }
  if (av === null) return 1;
  if (bv === null) return -1;
  if (bv !== av) return bv - av;
  return Math.abs(b.change_pct ?? 0) - Math.abs(a.change_pct ?? 0);
}

export function sortByVolumeDesc<T extends { volume: number | null; change_pct?: number | null }>(
  rows: T[],
): T[] {
  return [...rows].sort(compareByVolumeDesc);
}

// ------------------------------------------------------------------ catalyst

export function isProviderReported(row: { verification_state?: unknown }): boolean {
  return row.verification_state === "provider_reported";
}

/** Deduplicate on dedupe_key when present, else id. */
export function dedupeCatalyst<T extends { id?: unknown; dedupe_key?: unknown }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    const key = typeof r.dedupe_key === "string" && r.dedupe_key
      ? r.dedupe_key
      : typeof r.id === "string"
        ? r.id
        : null;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Earnings time_of_day, honestly. Never invents an exact clock time.
 * Returns "before_open" | "after_close" | "during" | null (unknown).
 */
export function normalizeTimeOfDay(v: unknown): "before_open" | "after_close" | "during" | null {
  if (v === "before_open" || v === "after_close" || v === "during") return v;
  return null;
}

// ------------------------------------------------------------------- news

export function isHttpsUrl(v: unknown): v is string {
  if (typeof v !== "string") return false;
  try {
    return new URL(v).protocol === "https:";
  } catch {
    return false;
  }
}

// -------------------------------------------------------------- checklist

export interface ChecklistSource {
  watchlistPremarketCount: number;
  catalystTodayCount: number;
  beforeOpenEarningsCount: number;
  awaitingRefreshCount: number;
  journalMissingRiskCount: number;
  volumeLeaderCount: number;
}

export interface ChecklistItem {
  id: string;
  label: string;
  count: number;
  route: string | null;
}

/** Emit only items backed by an actual non-zero source count. */
export function buildChecklist(s: ChecklistSource): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const push = (id: string, count: number, label: (n: number) => string, route: string | null) => {
    if (Number.isFinite(count) && count > 0) items.push({ id, label: label(count), count, route });
  };
  push("watchlist_premarket", s.watchlistPremarketCount,
    (n) => `Review ${n} current Watchlist Pre-Market ${n === 1 ? "name" : "names"}`, "/dashboard/watchlist");
  push("catalysts_today", s.catalystTodayCount,
    (n) => `Review ${n} provider-reported ${n === 1 ? "catalyst" : "catalysts"} scheduled today`, "/dashboard/catalyst");
  push("earnings_before_open", s.beforeOpenEarningsCount,
    (n) => `Review ${n} before-open ${n === 1 ? "earnings event" : "earnings events"}`, "/dashboard/catalyst");
  push("awaiting_refresh", s.awaitingRefreshCount,
    (n) => `Review ${n} Watchlist ${n === 1 ? "analysis" : "analyses"} awaiting refresh`, "/dashboard/watchlist");
  push("journal_risk", s.journalMissingRiskCount,
    (n) => `Review ${n} open Journal ${n === 1 ? "trade" : "trades"} missing a recorded stop or target`, "/dashboard/journal");
  push("volume_leaders", s.volumeLeaderCount,
    (n) => `Review ${n} current Screener volume ${n === 1 ? "leader" : "leaders"}`, "/dashboard/screeners");
  return items;
}

// ==========================================================================
// P1-R1 — fail-closed calendar, evidence contracts and honest validation
// ==========================================================================

/** Shift an ET calendar date string by whole days (calendar math, not UTC slicing). */
export function etDateShift(etDate: string, days: number): string {
  if (!isIsoDate(etDate)) return etDate;
  const t = Date.parse(`${etDate}T00:00:00Z`);
  if (!Number.isFinite(t)) return etDate;
  return new Date(t + days * 86400_000).toISOString().slice(0, 10);
}

export type CalendarEvidence =
  | { ok: true; rows: UpcomingRow[] }
  | { ok: false; reason: "CALENDAR_UNAVAILABLE" };

/**
 * Validate a Polygon /v1/marketstatus/upcoming payload.
 * Any missing/malformed/partial row invalidates the whole calendar (fail closed).
 */
export function validateCalendarRows(body: unknown): CalendarEvidence {
  if (!Array.isArray(body)) return { ok: false, reason: "CALENDAR_UNAVAILABLE" };
  const rows: UpcomingRow[] = [];
  for (const r of body) {
    if (!r || typeof r !== "object" || Array.isArray(r)) return { ok: false, reason: "CALENDAR_UNAVAILABLE" };
    const o = r as Record<string, unknown>;
    if (!isIsoDate(o.date)) return { ok: false, reason: "CALENDAR_UNAVAILABLE" };
    if (typeof o.status !== "string" || !o.status.trim()) return { ok: false, reason: "CALENDAR_UNAVAILABLE" };
    if (typeof o.exchange !== "string" || !o.exchange.trim()) return { ok: false, reason: "CALENDAR_UNAVAILABLE" };
    rows.push({
      date: o.date,
      status: o.status,
      exchange: o.exchange,
      open: typeof o.open === "string" ? o.open : null,
      close: typeof o.close === "string" ? o.close : null,
    });
  }
  return { ok: true, rows };
}

/** Next known session open, derived only from validated future exchange rows. */
export function nextKnownSessionFrom(rows: UpcomingRow[], etDate: string): string | null {
  const future = rows
    .filter((r) =>
      isIsoDate(r.date) && (r.date as string) > etDate &&
      String(r.status ?? "").toLowerCase() !== "closed" &&
      isoOrNull(r.open) !== null
    )
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return future.length > 0 ? isoOrNull(future[0].open) : null;
}

export interface MarketContextResolution {
  status: MarketContextStatus;
  reason_code: string | null;
  source: "polygon_marketstatus" | null;
  official_open_at: string | null;
  official_close_at: string | null;
  next_known_session_at: string | null;
}

function unresolvedContext(reason: string): MarketContextResolution {
  return {
    status: "unavailable",
    reason_code: reason,
    source: null,
    official_open_at: null,
    official_close_at: null,
    next_known_session_at: null,
  };
}

/**
 * Resolve market context from provider evidence only.
 * Missing, malformed, partial or contradictory evidence → `unavailable`,
 * and the provider is never reported as the confirmed source.
 */
export function resolveMarketContext(a: {
  nowBody: unknown;
  calendarBody: unknown;
  etDate: string;
  etWeekday: string;
}): MarketContextResolution {
  const cal = validateCalendarRows(a.calendarBody);
  if (!cal.ok) return unresolvedContext(cal.reason);

  const cls = classifyToday(cal.rows, a.etDate);
  if (cls.kind === "conflict") return unresolvedContext("CALENDAR_CONTRADICTORY");

  if (!a.nowBody || typeof a.nowBody !== "object" || Array.isArray(a.nowBody)) {
    return unresolvedContext("CALENDAR_UNAVAILABLE");
  }
  if (!extractEtOffset((a.nowBody as { serverTime?: unknown }).serverTime)) {
    return unresolvedContext("PROVIDER_TIME_INVALID");
  }

  const holiday = cls.kind === "full_holiday";
  const status = mapMarketStatus(a.nowBody, {
    weekday: a.etWeekday,
    upcomingClosedToday: holiday,
  });
  if (status === "unavailable") return unresolvedContext("CALENDAR_UNAVAILABLE");

  const todayNyse = cal.rows.find((r) => r.date === a.etDate && r.exchange === "NYSE");
  return {
    status,
    reason_code: status === "non_trading_day"
      ? "NON_TRADING_DAY"
      : status === "premarket"
        ? null
        : "OUTSIDE_PREMARKET",
    source: "polygon_marketstatus",
    official_open_at: todayNyse ? isoOrNull(todayNyse.open) : null,
    official_close_at: cls.kind === "early_close" ? isoOrNull(cls.closeIso) : null,
    next_known_session_at: nextKnownSessionFrom(cal.rows, a.etDate),
  };
}

// ------------------------------------------------- Watchlist V2 evidence

export type PreMarketDirection = "bullish" | "bearish" | "neutral" | "data_unavailable";

/** Unknown/unauthorized directions become Data Unavailable. */
export function normalizeDirection(v: unknown): PreMarketDirection {
  return v === "bullish" || v === "bearish" || v === "neutral" ? v : "data_unavailable";
}

/** Authorized closed set mirrored from the locked Watchlist V2 signal contract. */
export const AUTHORIZED_SIGNAL_IDS: ReadonlySet<string> = new Set([
  "price_above_vwap",
  "price_below_vwap",
  "range_position_high",
  "range_position_low",
  "unusual_time_adjusted_volume",
  "hod_break",
  "lod_break",
  "premarket_high_break",
  "premarket_low_break",
  "prior_close_reclaim",
  "prior_close_loss",
]);

export interface PreMarketSignal {
  signal_id: string;
  label: string;
  direction: "bullish" | "bearish" | "neutral";
}

/**
 * Keep only validated, authorized signals keyed by `signal_id`.
 * Data Unavailable rows expose no signals at all.
 */
export function sanitizeMarketSignals(raw: unknown, opts: { unavailable: boolean }): PreMarketSignal[] {
  if (opts.unavailable || !Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: PreMarketSignal[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    const o = s as Record<string, unknown>;
    const id = typeof o.signal_id === "string" ? o.signal_id : null;
    if (!id || !AUTHORIZED_SIGNAL_IDS.has(id) || seen.has(id)) continue;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const dir = o.direction === "bullish" || o.direction === "bearish" || o.direction === "neutral"
      ? o.direction
      : null;
    if (!label || !dir) continue;
    seen.add(id);
    out.push({ signal_id: id, label, direction: dir });
  }
  return out;
}

// --------------------------------------------- analysis request lifecycle

export type RequestStatus = "pending" | "succeeded" | "failed";

export function normalizeRequestStatus(v: unknown): RequestStatus | null {
  return v === "pending" || v === "succeeded" || v === "failed" ? v : null;
}

export interface RequestState {
  status: RequestStatus;
  created_at: string | null;
  error_code: string | null;
}

/** Latest real request row per ticker — lifecycle is never inferred from absence. */
export function latestRequestByTicker(rows: Array<Record<string, unknown>>): Map<string, RequestState> {
  const out = new Map<string, RequestState>();
  for (const r of rows) {
    const t = normalizeSymbol(r.ticker);
    const status = normalizeRequestStatus(r.status);
    if (!t || !status) continue;
    const created = isoOrNull(r.created_at);
    const prev = out.get(t);
    if (prev && prev.created_at && created && prev.created_at >= created) continue;
    if (prev && !created) continue;
    out.set(t, {
      status,
      created_at: created,
      error_code: typeof r.error_code === "string" ? r.error_code : null,
    });
  }
  return out;
}

/** Honest lifecycle label for a watchlist symbol without current analysis. */
export function lifecycleLabel(state: RequestState | undefined): string {
  if (!state) return "No analysis request on record";
  if (state.status === "pending") return "Analysis pending";
  if (state.status === "failed") return "Last analysis request failed";
  return "Analysis awaiting refresh";
}

// -------------------------------------------------------------- journal

export function normalizeSide(v: unknown): "long" | "short" | null {
  return v === "long" || v === "short" ? v : null;
}

// -------------------------------------------------------------- indexes

/** Symbols expected but not present in a validated result set. */
export function missingSymbols(expected: readonly string[], present: Iterable<string>): string[] {
  const have = new Set(present);
  return expected.filter((s) => !have.has(s));
}

// ---------------------------------------------------- derived completeness

/**
 * A derived section may only claim `available`/`empty` when every required
 * input query actually succeeded.
 */
export function derivedSectionStatus(
  inputsComplete: boolean,
  itemCount: number,
): { status: SectionStatus; reason_code: ReasonCode | null } {
  if (!inputsComplete) return { status: "unavailable", reason_code: "INCOMPLETE_COVERAGE" };
  if (itemCount === 0) return { status: "empty", reason_code: "NO_QUALIFYING_DATA" };
  return { status: "available", reason_code: null };
}

// ------------------------------------------------------------- alerts

export interface PreMarketAlert {
  dedupe_key: string;
  ticker: string;
  alert_type: string;
  reason: string;
  event_time: string;
}

const ALERT_TYPES = new Set([
  "direction_change",
  "unusual_volume",
  "market_signal",
  "company_event",
  "earnings_upcoming",
]);

/** Validate + dedupe alerts on the persisted dedupe key, for owned symbols only. */
export function sanitizeAlerts(
  rows: Array<Record<string, unknown>>,
  ownedSymbols: Set<string>,
): PreMarketAlert[] {
  const seen = new Set<string>();
  const out: PreMarketAlert[] = [];
  for (const r of rows) {
    const ticker = normalizeSymbol(r.ticker);
    const key = typeof r.dedupe_key === "string" ? r.dedupe_key.trim() : "";
    const type = typeof r.alert_type === "string" ? r.alert_type : "";
    const reason = typeof r.reason === "string" ? r.reason.trim() : "";
    const eventTime = isoOrNull(r.event_time);
    if (!ticker || !ownedSymbols.has(ticker) || !key || seen.has(key)) continue;
    if (!ALERT_TYPES.has(type) || !reason || !eventTime) continue;
    seen.add(key);
    out.push({ dedupe_key: key, ticker, alert_type: type, reason, event_time: eventTime });
  }
  out.sort((a, b) => b.event_time.localeCompare(a.event_time));
  return out;
}

// --------------------------------------------------------- volume leaders

export interface RawVolumeRow {
  symbol: string | null;
  volume: number | null;
  updated_at: string | null;
}

/** Only rows with a valid positive volume AND an establishable timestamp survive. */
export function isUsableVolumeRow(r: RawVolumeRow): boolean {
  return r.symbol !== null && r.volume !== null && r.volume > 0 && r.updated_at !== null;
}
