// Pure, dependency-free helpers for the Pre-Market workspace aggregator.
// No network, no Supabase, no Deno APIs → fully unit-testable.

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
