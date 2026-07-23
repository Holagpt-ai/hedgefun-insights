// Contract types + runtime validators for Watchlist V2. No `as` casts used as proof.
// Recursive forbidden-key scanner enforces the permanent scoreless rule.

export const CONTRACT_VERSION = 2 as const;
export const TICKER_RE = /^[A-Z][A-Z0-9.-]{0,14}$/;

export type SessionType = "premarket" | "rth" | "postclose";
export type Direction = "bullish" | "bearish" | "neutral" | "data_unavailable";
export type RvolClass = "normal" | "elevated" | "unusual";

export interface IntradayBar {
  t: number; o: number; h: number; l: number; c: number; v: number;
}

export type SignalCategory = "trend" | "level" | "volume" | "range";
export type SignalKind = "state" | "transition";
export type SignalDirection = "bullish" | "bearish" | "neutral" | null;

export interface MarketSignal {
  signal_id: string;
  label: string;
  category: SignalCategory;
  kind: SignalKind;
  direction: SignalDirection;
  facts: Record<string, number | string | boolean>;
  inputs: string[];
  observed_at: string;
  rule_version: "w2b1c.1";
}

export interface RecentEvent {
  event_id: string;
  event_type: "news";
  title: string;
  event_time: string;
  source_name: string;
  source_url: string | null;
  verification_state: "provider_reported";
  ingested_at: string;
}

export interface KeyLevels {
  vwap: number | null;
  hod: number | null;
  lod: number | null;
  premarket_high: number | null;
  premarket_low: number | null;
  prior_close: number | null;
  basis: {
    hod_lod_scope: "premarket" | "rth" | "session_to_date";
    vwap_scope: "rth" | "session_to_date" | null;
  };
}

export type QualitySnapshot = "ok" | "missing" | "stale" | "malformed";
export type QualityBars = "ok" | "missing" | "insufficient" | "malformed";
export type QualityPriorClose = "ok" | "missing";
export type QualityVolume = "ok" | "missing";
export type QualityRvol =
  | "ok" | "no_baseline" | "baseline_invalid"
  | "baseline_incompatible" | "not_applicable_session";
export type QualityEvents = "ok" | "missing" | "none_qualifying";

export interface InputsQuality {
  snapshot: QualitySnapshot;
  bars: QualityBars;
  prior_close: QualityPriorClose;
  volume: QualityVolume;
  rvol: QualityRvol;
  events: QualityEvents;
  bar_count: number;
  feed_delay_note: "provider feed is 15-minute delayed";
  reason_codes: string[];
}

export interface AnalysisV2Payload {
  ticker: string;
  contract_version: 2;
  session_date: string;
  session_type: SessionType;
  valid_through: string;
  direction: Direction;
  explanation: string;
  driver_ids: string[];
  failure_reason: string | null;
  price: number | null;
  change_pct: number | null;
  intraday: IntradayBar[];
  volume: number | null;
  rvol: number | null;
  rvol_class: RvolClass | null;
  market_signals: MarketSignal[];
  recent_events: RecentEvent[];
  key_levels: KeyLevels;
  inputs_quality: InputsQuality;
  analyzed_at: string;
  run_id: string | null;
}

export interface AlertCandidate {
  ticker: string;
  alert_type:
    | "direction_change" | "unusual_volume" | "market_signal"
    | "company_event" | "earnings_upcoming";
  reason: string;
  facts: Record<string, number | string | boolean>;
  event_time: string;
  session_date: string;
  dedupe_key: string;
}

export function normalizeTicker(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  if (!TICKER_RE.test(t)) return null;
  return t;
}

// ── Forbidden-key recursive scan ──────────────────────────────────────────
const EXACT_FORBIDDEN = new Set([
  "hf_score", "hf_score_prev", "conf", "weight", "weighted",
  "rank", "tier", "band", "sentiment_score", "opportunity_score",
  "momentum_score",
]);

export function containsForbiddenKey(value: unknown): string | null {
  const seen = new WeakSet<object>();
  function walk(v: unknown): string | null {
    if (v === null || typeof v !== "object") return null;
    if (seen.has(v as object)) return null;
    seen.add(v as object);
    if (Array.isArray(v)) {
      for (const item of v) {
        const hit = walk(item);
        if (hit) return hit;
      }
      return null;
    }
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const kl = k.toLowerCase();
      if (EXACT_FORBIDDEN.has(kl)) return k;
      if (kl.includes("score") || kl.includes("confidence")) return k;
      const hit = walk(val);
      if (hit) return hit;
    }
    return null;
  }
  return walk(value);
}

// ── Validators ────────────────────────────────────────────────────────────
type Ok<T> = { ok: true; value: T };
type Err = { ok: false; reason: string };
type Result<T> = Ok<T> | Err;

function isFiniteNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}
function isNonNegFiniteNum(x: unknown): x is number {
  return isFiniteNum(x) && x >= 0;
}
function isString(x: unknown): x is string {
  return typeof x === "string";
}
function isNonEmptyStr(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}
function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}
function isYMD(x: unknown): x is string {
  return typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
}
function isISO(x: unknown): x is string {
  return typeof x === "string" && Number.isFinite(Date.parse(x));
}
function isSessionType(x: unknown): x is SessionType {
  return x === "premarket" || x === "rth" || x === "postclose";
}
function isDirection(x: unknown): x is Direction {
  return x === "bullish" || x === "bearish" || x === "neutral" || x === "data_unavailable";
}

function validateIntradayBar(b: unknown): b is IntradayBar {
  if (!isPlainObject(b)) return false;
  const { t, o, h, l, c, v } = b;
  if (!isFiniteNum(t) || !isFiniteNum(o) || !isFiniteNum(h)
    || !isFiniteNum(l) || !isFiniteNum(c) || !isFiniteNum(v)) return false;
  if (v < 0) return false;
  if (h < l) return false;
  if (o < l || o > h) return false;
  if (c < l || c > h) return false;
  return true;
}

function validateKeyLevels(k: unknown): k is KeyLevels {
  if (!isPlainObject(k)) return false;
  const nums: Array<keyof KeyLevels> = ["vwap", "hod", "lod", "premarket_high", "premarket_low", "prior_close"];
  for (const key of nums) {
    const val = (k as Record<string, unknown>)[key];
    if (val !== null && !(isFiniteNum(val) && val > 0)) return false;
  }
  const basis = (k as Record<string, unknown>).basis;
  if (!isPlainObject(basis)) return false;
  const hs = basis.hod_lod_scope;
  const vs = basis.vwap_scope;
  if (hs !== "premarket" && hs !== "rth" && hs !== "session_to_date") return false;
  if (vs !== null && vs !== "rth" && vs !== "session_to_date") return false;
  return true;
}

function validateInputsQuality(q: unknown): q is InputsQuality {
  if (!isPlainObject(q)) return false;
  const snap = q.snapshot;
  if (snap !== "ok" && snap !== "missing" && snap !== "stale" && snap !== "malformed") return false;
  const bars = q.bars;
  if (bars !== "ok" && bars !== "missing" && bars !== "insufficient" && bars !== "malformed") return false;
  const pc = q.prior_close;
  if (pc !== "ok" && pc !== "missing") return false;
  const vol = q.volume;
  if (vol !== "ok" && vol !== "missing") return false;
  const rv = q.rvol;
  if (!["ok", "no_baseline", "baseline_invalid", "baseline_incompatible", "not_applicable_session"].includes(String(rv))) return false;
  const ev = q.events;
  if (ev !== "ok" && ev !== "missing" && ev !== "none_qualifying") return false;
  if (!isNonNegFiniteNum(q.bar_count) || !Number.isInteger(q.bar_count)) return false;
  if (q.feed_delay_note !== "provider feed is 15-minute delayed") return false;
  if (!Array.isArray(q.reason_codes)) return false;
  for (const r of q.reason_codes) if (typeof r !== "string") return false;
  return true;
}

function validateMarketSignal(s: unknown): s is MarketSignal {
  if (!isPlainObject(s)) return false;
  if (!isNonEmptyStr(s.signal_id)) return false;
  if (!isString(s.label) || (s.label as string).length === 0 || (s.label as string).length > 80) return false;
  if (!["trend", "level", "volume", "range"].includes(String(s.category))) return false;
  if (s.kind !== "state" && s.kind !== "transition") return false;
  const dir = s.direction;
  if (dir !== null && dir !== "bullish" && dir !== "bearish" && dir !== "neutral") return false;
  if (!isPlainObject(s.facts)) return false;
  for (const [, v] of Object.entries(s.facts)) {
    if (typeof v !== "number" && typeof v !== "string" && typeof v !== "boolean") return false;
    if (typeof v === "number" && !Number.isFinite(v)) return false;
  }
  if (!Array.isArray(s.inputs) || !s.inputs.every(isString)) return false;
  if (!isISO(s.observed_at)) return false;
  if (s.rule_version !== "w2b1c.1") return false;
  return true;
}

function validateRecentEvent(e: unknown): e is RecentEvent {
  if (!isPlainObject(e)) return false;
  if (!isNonEmptyStr(e.event_id)) return false;
  if (e.event_type !== "news") return false;
  if (!isString(e.title) || (e.title as string).length === 0 || (e.title as string).length > 300) return false;
  if (!isISO(e.event_time)) return false;
  if (!isNonEmptyStr(e.source_name)) return false;
  if (e.source_url !== null && !(typeof e.source_url === "string" && (e.source_url as string).startsWith("https://"))) return false;
  if (e.verification_state !== "provider_reported") return false;
  if (!isISO(e.ingested_at)) return false;
  return true;
}

export function validateAnalysisV2Payload(payload: unknown): Result<AnalysisV2Payload> {
  if (!isPlainObject(payload)) return { ok: false, reason: "payload_not_object" };
  const p = payload;
  if (p.contract_version !== 2) return { ok: false, reason: "bad_contract_version" };
  if (!isString(p.ticker) || !TICKER_RE.test(p.ticker as string)) return { ok: false, reason: "bad_ticker" };
  if (!isYMD(p.session_date)) return { ok: false, reason: "bad_session_date" };
  if (!isSessionType(p.session_type)) return { ok: false, reason: "bad_session_type" };
  if (!isISO(p.valid_through)) return { ok: false, reason: "bad_valid_through" };
  if (!isISO(p.analyzed_at)) return { ok: false, reason: "bad_analyzed_at" };
  if (Date.parse(p.valid_through as string) <= Date.parse(p.analyzed_at as string)) {
    return { ok: false, reason: "valid_through_not_after_analyzed_at" };
  }
  if (!isDirection(p.direction)) return { ok: false, reason: "bad_direction" };
  if (!isString(p.explanation) || (p.explanation as string).length === 0) return { ok: false, reason: "bad_explanation" };
  if (p.direction === "data_unavailable") {
    if (!isNonEmptyStr(p.failure_reason)) return { ok: false, reason: "missing_failure_reason" };
  } else {
    if (p.failure_reason !== null) return { ok: false, reason: "unexpected_failure_reason" };
  }
  if (!Array.isArray(p.driver_ids) || !p.driver_ids.every(isString)) return { ok: false, reason: "bad_driver_ids" };
  if (p.price !== null && !isFiniteNum(p.price)) return { ok: false, reason: "bad_price" };
  if (p.change_pct !== null && !isFiniteNum(p.change_pct)) return { ok: false, reason: "bad_change_pct" };
  if (!Array.isArray(p.intraday) || !p.intraday.every(validateIntradayBar)) return { ok: false, reason: "bad_intraday" };
  if (p.volume !== null && !(isFiniteNum(p.volume) && p.volume >= 0 && Number.isInteger(p.volume))) return { ok: false, reason: "bad_volume" };
  if (p.rvol !== null && !(isFiniteNum(p.rvol) && p.rvol >= 0)) return { ok: false, reason: "bad_rvol" };
  if (p.rvol_class !== null && p.rvol_class !== "normal" && p.rvol_class !== "elevated" && p.rvol_class !== "unusual") return { ok: false, reason: "bad_rvol_class" };
  if (!Array.isArray(p.market_signals) || !p.market_signals.every(validateMarketSignal)) return { ok: false, reason: "bad_market_signals" };
  if (!Array.isArray(p.recent_events) || !p.recent_events.every(validateRecentEvent)) return { ok: false, reason: "bad_recent_events" };
  if (!validateKeyLevels(p.key_levels)) return { ok: false, reason: "bad_key_levels" };
  if (!validateInputsQuality(p.inputs_quality)) return { ok: false, reason: "bad_inputs_quality" };
  if (p.run_id !== null && !(typeof p.run_id === "string")) return { ok: false, reason: "bad_run_id" };

  const forbidden = containsForbiddenKey(payload);
  if (forbidden) return { ok: false, reason: `forbidden_key:${forbidden}` };

  return { ok: true, value: payload as unknown as AnalysisV2Payload };
}
