/**
 * Current prioritized Risk & Attention Flags.
 * History is retained separately; the current view is a bounded, de-duplicated
 * snapshot that never shows contradictory direction states at once.
 */

export type RiskKind =
  | "data_unavailable"
  | "journal_risk_missing"
  | "earnings_today"
  | "unusual_volume"
  | "direction_state"
  | "bearish_signal"
  | "bullish_signal"
  | "alert_direction_change"
  | "alert_unusual_volume"
  | "alert_market_signal"
  | "alert_company_event"
  | "alert_earnings_upcoming"
  | "analysis_pending"
  | "analysis_failed"
  | "awaiting_refresh";

export type RiskSource = "deterministic" | "verified_event" | "watchlist_alert" | "system";

export interface RawRiskItem {
  id: string;
  symbol: string | null;
  kind: string;
  label: string;
  detail: string | null;
  route: string | null;
  event_time?: string | null;
  source?: RiskSource;
}

export interface ConsolidatedRiskItem extends RawRiskItem {
  source: RiskSource;
  event_time: string | null;
  current: boolean;
  history_key: string;
}

export const CURRENT_FLAGS_PER_TICKER = 3;

/** Expiration windows by alert type (ms). Null = does not expire. */
export const EXPIRATION_MS: Record<string, number | null> = {
  data_unavailable: null,
  journal_risk_missing: null,
  analysis_pending: null,
  analysis_failed: null,
  awaiting_refresh: null,
  earnings_today: 24 * 60 * 60 * 1000,
  unusual_volume: 6 * 60 * 60 * 1000,
  bearish_signal: 8 * 60 * 60 * 1000,
  bullish_signal: 8 * 60 * 60 * 1000,
  direction_state: 12 * 60 * 60 * 1000,
  alert_direction_change: 12 * 60 * 60 * 1000,
  alert_unusual_volume: 6 * 60 * 60 * 1000,
  alert_market_signal: 8 * 60 * 60 * 1000,
  alert_company_event: 12 * 60 * 60 * 1000,
  alert_earnings_upcoming: 24 * 60 * 60 * 1000,
};

const PRIORITY: Record<string, number> = {
  data_unavailable: 10,
  journal_risk_missing: 20,
  earnings_today: 30,
  unusual_volume: 40,
  alert_unusual_volume: 41,
  direction_state: 50,
  alert_direction_change: 51,
  bearish_signal: 60,
  bullish_signal: 61,
  alert_market_signal: 70,
  alert_company_event: 80,
  alert_earnings_upcoming: 90,
  analysis_failed: 100,
  analysis_pending: 110,
  awaiting_refresh: 120,
};

function sourceFor(kind: string): RiskSource {
  if (kind.startsWith("alert_")) return "watchlist_alert";
  if (kind === "earnings_today" || kind === "alert_company_event" || kind === "alert_earnings_upcoming") {
    return "verified_event";
  }
  if (
    kind === "bearish_signal" ||
    kind === "bullish_signal" ||
    kind === "unusual_volume" ||
    kind === "direction_state"
  ) {
    return "deterministic";
  }
  return "system";
}

function isoOrNull(v: unknown): string | null {
  if (typeof v !== "string" || !v) return null;
  return Number.isFinite(Date.parse(v)) ? v : null;
}

function identityKey(item: RawRiskItem): string {
  const symbol = item.symbol ?? "_";
  const label = (item.label ?? "").trim().toLowerCase();
  const detail = (item.detail ?? "").trim().toLowerCase();
  const kind = item.kind;
  return `${symbol}|${kind}|${label}|${detail}`;
}

function isExpired(kind: string, eventTime: string | null, nowMs: number): boolean {
  const window = EXPIRATION_MS[kind];
  if (window === null || window === undefined) return false;
  if (!eventTime) return false;
  const t = Date.parse(eventTime);
  if (!Number.isFinite(t)) return false;
  return nowMs - t > window;
}

function directionFrom(item: RawRiskItem): "bullish" | "bearish" | null {
  const blob = `${item.kind} ${item.label} ${item.detail ?? ""}`.toLowerCase();
  const toBear = /to bearish|direction changed from bullish to bearish/.test(blob);
  const toBull = /to bullish|direction changed from bearish to bullish/.test(blob);
  if (toBear) return "bearish";
  if (toBull) return "bullish";
  if (item.kind === "bearish_signal") return "bearish";
  if (item.kind === "bullish_signal") return "bullish";
  return null;
}

export interface RiskConsolidation {
  current: ConsolidatedRiskItem[];
  history: ConsolidatedRiskItem[];
}

/**
 * Deduplicate, expire, collapse direction sequences, cap per ticker, keep history.
 */
export function consolidateRiskFlags(
  items: RawRiskItem[],
  nowMs: number,
): RiskConsolidation {
  const history: ConsolidatedRiskItem[] = [];
  const seenIdentity = new Set<string>();

  for (const raw of items) {
    const event_time = isoOrNull(raw.event_time) ?? null;
    const source = raw.source ?? sourceFor(raw.kind);
    const history_key = identityKey(raw);
    const row: ConsolidatedRiskItem = {
      ...raw,
      source,
      event_time,
      current: false,
      history_key,
    };
    history.push(row);
  }

  // Newest first for identity collapse.
  history.sort((a, b) => {
    const at = a.event_time ? Date.parse(a.event_time) : 0;
    const bt = b.event_time ? Date.parse(b.event_time) : 0;
    return bt - at;
  });

  const candidates: ConsolidatedRiskItem[] = [];
  for (const row of history) {
    if (seenIdentity.has(row.history_key)) continue;
    seenIdentity.add(row.history_key);
    if (isExpired(row.kind, row.event_time, nowMs)) continue;
    candidates.push({ ...row, current: true });
  }

  // Collapse direction changes per ticker to the latest known state.
  const latestDirection = new Map<string, { dir: "bullish" | "bearish"; id: string; time: number }>();
  for (const row of candidates) {
    if (!row.symbol) continue;
    const dir = directionFrom(row);
    if (!dir) continue;
    const time = row.event_time ? Date.parse(row.event_time) : 0;
    const prev = latestDirection.get(row.symbol);
    if (!prev || time >= prev.time) {
      latestDirection.set(row.symbol, { dir, id: row.id, time });
    }
  }

  const afterDirection = candidates.filter((row) => {
    if (!row.symbol) return true;
    const dir = directionFrom(row);
    if (!dir) return true;
    const latest = latestDirection.get(row.symbol);
    if (!latest) return true;
    if (dir !== latest.dir) return false;
    // Keep only the latest item for that direction state (drop older same-direction noise).
    return row.id === latest.id;
  });

  // Priority sort, then cap 3 per ticker. Symbol-less items are independent.
  afterDirection.sort((a, b) => {
    const pa = PRIORITY[a.kind] ?? 500;
    const pb = PRIORITY[b.kind] ?? 500;
    if (pa !== pb) return pa - pb;
    const at = a.event_time ? Date.parse(a.event_time) : 0;
    const bt = b.event_time ? Date.parse(b.event_time) : 0;
    return bt - at;
  });

  const perTicker = new Map<string, number>();
  const current: ConsolidatedRiskItem[] = [];
  for (const row of afterDirection) {
    const key = row.symbol ?? `id:${row.id}`;
    const used = perTicker.get(key) ?? 0;
    if (used >= CURRENT_FLAGS_PER_TICKER) continue;
    perTicker.set(key, used + 1);
    current.push(row);
  }

  return { current, history };
}
