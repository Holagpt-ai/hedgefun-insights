// Pure client-side builders/validators for the Pre-Market workspace.
// No React, no fetching — unit-testable.

import type {
  JournalReadiness,
  MarketContextStatus,
  PreMarketLifecycleEntry,
  PreMarketSignal,
  PreMarketWorkspaceResponse,
  SectionEnvelope,
  SectionStatus,
} from "@/types/pre-market";

const TICKER_REGEX = /^[A-Z][A-Z0-9.-]{0,14}$/;

export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  return TICKER_REGEX.test(t) ? t : null;
}

/** Symbol-aware workflow routes. Symbol is validated then URL-encoded. */
export function symbolRoutes(rawSymbol: string) {
  const s = normalizeSymbol(rawSymbol);
  if (!s) return null;
  const e = encodeURIComponent(s);
  return {
    symbol: s,
    ai: `/dashboard/ai?symbol=${e}`,
    catalyst: `/dashboard/catalyst?symbol=${e}`,
    watchlist: `/dashboard/watchlist?symbol=${e}`,
    journal: `/dashboard/journal?symbol=${e}`,
    stock: `/stocks/${e}`,
  };
}

const STATUSES: SectionStatus[] = ["available", "empty", "stale", "unavailable"];

function failClosed<T>(empty: T): SectionEnvelope<T> {
  return { status: "unavailable", data: empty, as_of: null, reason_code: "QUERY_FAILED" };
}

/** Validate a section envelope; malformed sections fail closed as unavailable. */
export function validateSection<T>(raw: unknown, empty: T, isArray: boolean): SectionEnvelope<T> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return failClosed(empty);
  const r = raw as Record<string, unknown>;
  if (typeof r.status !== "string" || !STATUSES.includes(r.status as SectionStatus)) return failClosed(empty);
  if (isArray && !Array.isArray(r.data)) return failClosed(empty);
  if (!isArray && (!r.data || typeof r.data !== "object" || Array.isArray(r.data))) return failClosed(empty);
  return {
    status: r.status as SectionStatus,
    data: r.data as T,
    as_of: typeof r.as_of === "string" ? r.as_of : null,
    reason_code: typeof r.reason_code === "string" ? r.reason_code : null,
  };
}

const MARKET_STATUSES: MarketContextStatus[] = [
  "premarket", "regular", "afterhours", "closed", "non_trading_day", "unavailable",
];

const EMPTY_JOURNAL: JournalReadiness = {
  open_trades: 0, missing_stop: 0, missing_target: 0, symbols: [],
};

/** Authorized closed set of Watchlist V2 signal ids (mirrors the backend contract). */
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

/**
 * Client-side guard: renderable signals must carry an authorized `signal_id`,
 * a human label and a valid direction. Data Unavailable rows render none.
 */
export function renderableSignals(
  raw: unknown,
  opts: { unavailable: boolean },
): PreMarketSignal[] {
  if (opts.unavailable || !Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: PreMarketSignal[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object" || Array.isArray(s)) continue;
    const o = s as Record<string, unknown>;
    const id = typeof o.signal_id === "string" ? o.signal_id : "";
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const dir = o.direction === "bullish" || o.direction === "bearish" || o.direction === "neutral"
      ? o.direction
      : null;
    if (!id || !AUTHORIZED_SIGNAL_IDS.has(id) || seen.has(id) || !label || !dir) continue;
    seen.add(id);
    out.push({ signal_id: id, label, direction: dir });
  }
  return out;
}

function validateLifecycle(raw: unknown): PreMarketLifecycleEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: PreMarketLifecycleEntry[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object" || Array.isArray(r)) continue;
    const o = r as Record<string, unknown>;
    const ticker = normalizeSymbol(o.ticker);
    const label = typeof o.label === "string" ? o.label.trim() : "";
    if (!ticker || !label) continue;
    out.push({ ticker, label });
  }
  return out;
}

/**
 * Validate a whole workspace payload. Returns null when the envelope itself
 * is unusable (wrong contract version / not an object). Individual malformed
 * sections degrade to `unavailable` rather than poisoning the page.
 */
export function validateWorkspace(raw: unknown): PreMarketWorkspaceResponse | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.contract_version !== 1) return null;
  if (typeof r.server_now !== "string" || !Number.isFinite(Date.parse(r.server_now))) return null;

  const mcRaw = (r.market_context && typeof r.market_context === "object" ? r.market_context : {}) as Record<string, unknown>;
  const status = MARKET_STATUSES.includes(mcRaw.status as MarketContextStatus)
    ? (mcRaw.status as MarketContextStatus)
    : "unavailable";

  return {
    contract_version: 1,
    server_now: r.server_now,
    watchlist_lifecycle: validateLifecycle(r.watchlist_lifecycle),
    alerts_included: r.alerts_included === true,
    market_context: {
      status,
      et_date: typeof mcRaw.et_date === "string" ? mcRaw.et_date : "",
      et_time: typeof mcRaw.et_time === "string" ? mcRaw.et_time : "",
      checked_at: typeof mcRaw.checked_at === "string" ? mcRaw.checked_at : r.server_now,
      source: mcRaw.source === "polygon_marketstatus" ? "polygon_marketstatus" : null,
      reason_code: typeof mcRaw.reason_code === "string" ? mcRaw.reason_code : null,
      official_open_at: typeof mcRaw.official_open_at === "string" ? mcRaw.official_open_at : null,
      official_close_at: typeof mcRaw.official_close_at === "string" ? mcRaw.official_close_at : null,
      next_known_session_at: typeof mcRaw.next_known_session_at === "string" ? mcRaw.next_known_session_at : null,
    },
    indexes: validateSection(r.indexes, [], true),
    watchlist_activity: validateSection(r.watchlist_activity, [], true),
    risk_attention: validateSection(r.risk_attention, [], true),
    catalyst_watch: validateSection(r.catalyst_watch, [], true),
    earnings: validateSection(r.earnings, [], true),
    volume_leaders: validateSection(r.volume_leaders, [], true),
    journal_readiness: validateSection(r.journal_readiness, EMPTY_JOURNAL, false),
    headlines: validateSection(r.headlines, [], true),
    checklist: validateSection(r.checklist, [], true),
  };
}

// ------------------------------------------------------------------- labels

export function marketContextLabel(status: MarketContextStatus): string {
  switch (status) {
    case "premarket": return "Pre-Market session active";
    case "regular": return "Regular session — no Pre-Market session active";
    case "afterhours": return "After-hours session — no Pre-Market session active";
    case "closed": return "Market closed — no Pre-Market session active";
    case "non_trading_day": return "Non-trading day — no Pre-Market session active";
    default: return "Market session unavailable";
  }
}

export function directionLabel(direction: string): string {
  switch (direction) {
    case "bullish": return "Bullish";
    case "bearish": return "Bearish";
    case "neutral": return "Neutral";
    default: return "Data Unavailable";
  }
}

export function timeOfDayLabel(v: string | null): string {
  switch (v) {
    case "before_open": return "Before Open";
    case "after_close": return "After Close";
    case "during": return "During Market Hours";
    default: return "Time unavailable";
  }
}

/** Compact relative age, e.g. "4m ago". Returns null for unusable input. */
export function relativeAge(iso: string | null, nowMs: number = Date.now()): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.floor((nowMs - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Exact ET timestamp label for "last available" disclosures. */
export function etTimestampLabel(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(new Date(t)) + " ET";
}

/** Numeric display that never renders a missing value as 0. */
export function numberOrDash(v: number | null | undefined, fmt: (n: number) => string): string {
  return typeof v === "number" && Number.isFinite(v) ? fmt(v) : "—";
}

export function formatVolume(v: number | null | undefined): string {
  return numberOrDash(v, (n) => {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(Math.round(n));
  });
}

export function formatPrice(v: number | null | undefined): string {
  return numberOrDash(v, (n) => (n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`));
}

export function formatPercent(v: number | null | undefined): string {
  return numberOrDash(v, (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`);
}
