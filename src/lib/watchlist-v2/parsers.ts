// Runtime validators for persisted Watchlist V2 JSON fields.
// Nothing in this file may synthesize price/chart/volume data — malformed
// input must yield null (honest "unavailable" state) rather than a fallback.

export type V2Direction = "bullish" | "bearish" | "neutral" | "data_unavailable";
export type V2Session = "premarket" | "rth" | "postclose";
export type RvolClass = "normal" | "elevated" | "unusual";

export interface IntradayBar {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface MarketSignal {
  signal_id: string;
  label: string;
  category: "trend" | "level" | "volume" | "range";
  kind: "state" | "transition";
  direction: "bullish" | "bearish" | "neutral" | null;
  observed_at: string;
}

export interface RecentEvent {
  event_id: string;
  event_type: "news";
  title: string;
  event_time: string;
  source_name: string;
  source_url: string | null;
  verification_state: "provider_reported";
}

export interface KeyLevels {
  vwap: number | null;
  hod: number | null;
  lod: number | null;
  premarket_high: number | null;
  premarket_low: number | null;
  prior_close: number | null;
}

export interface InputsQuality {
  snapshot?: string;
  bars?: string;
  prior_close?: string;
  volume?: string;
  rvol?: string;
  events?: string;
  bar_count?: number;
  feed_delay_note?: string;
  reason_codes?: string[];
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  x !== null && typeof x === "object" && !Array.isArray(x);
const isFin = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === "string";

export function parseIntradayBars(raw: unknown): IntradayBar[] {
  if (!Array.isArray(raw)) return [];
  const out: IntradayBar[] = [];
  for (const item of raw) {
    if (!isObj(item)) continue;
    const { t, o, h, l, c, v } = item as Record<string, unknown>;
    if (!isFin(t) || !isFin(o) || !isFin(h) || !isFin(l) || !isFin(c) || !isFin(v)) continue;
    if (v < 0 || h < l || o < l || o > h || c < l || c > h) continue;
    out.push({ t, o, h, l, c, v });
  }
  return out;
}

export function parseDriverIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => isStr(x) && x.length > 0);
}

export function parseMarketSignals(raw: unknown): MarketSignal[] {
  if (!Array.isArray(raw)) return [];
  const out: MarketSignal[] = [];
  for (const s of raw) {
    if (!isObj(s)) continue;
    const id = s.signal_id;
    const label = s.label;
    const cat = s.category;
    const kind = s.kind;
    const dir = s.direction;
    const obs = s.observed_at;
    if (!isStr(id) || !id) continue;
    if (!isStr(label) || !label) continue;
    if (cat !== "trend" && cat !== "level" && cat !== "volume" && cat !== "range") continue;
    if (kind !== "state" && kind !== "transition") continue;
    if (dir !== null && dir !== "bullish" && dir !== "bearish" && dir !== "neutral") continue;
    if (!isStr(obs) || !Number.isFinite(Date.parse(obs))) continue;
    out.push({ signal_id: id, label, category: cat, kind, direction: dir, observed_at: obs });
  }
  return out;
}

export function isValidHttpsUrl(u: unknown): u is string {
  if (!isStr(u)) return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

export function parseRecentEvents(raw: unknown): RecentEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentEvent[] = [];
  for (const e of raw) {
    if (!isObj(e)) continue;
    const id = e.event_id;
    const type = e.event_type;
    const title = e.title;
    const et = e.event_time;
    const src = e.source_name;
    const url = e.source_url;
    const ver = e.verification_state;
    if (!isStr(id) || !id) continue;
    if (type !== "news") continue;
    if (!isStr(title) || !title) continue;
    if (!isStr(et) || !Number.isFinite(Date.parse(et))) continue;
    if (!isStr(src) || !src) continue;
    if (url !== null && !isValidHttpsUrl(url)) continue;
    if (ver !== "provider_reported") continue;
    out.push({
      event_id: id,
      event_type: "news",
      title,
      event_time: et,
      source_name: src,
      source_url: url === null ? null : (url as string),
      verification_state: "provider_reported",
    });
  }
  return out;
}

export function parseKeyLevels(raw: unknown): KeyLevels {
  const empty: KeyLevels = {
    vwap: null, hod: null, lod: null,
    premarket_high: null, premarket_low: null, prior_close: null,
  };
  if (!isObj(raw)) return empty;
  const num = (k: string): number | null => {
    const v = (raw as Record<string, unknown>)[k];
    return isFin(v) && v > 0 ? v : null;
  };
  return {
    vwap: num("vwap"),
    hod: num("hod"),
    lod: num("lod"),
    premarket_high: num("premarket_high"),
    premarket_low: num("premarket_low"),
    prior_close: num("prior_close"),
  };
}

export function parseInputsQuality(raw: unknown): InputsQuality {
  if (!isObj(raw)) return {};
  const q = raw as Record<string, unknown>;
  const out: InputsQuality = {};
  if (isStr(q.snapshot)) out.snapshot = q.snapshot;
  if (isStr(q.bars)) out.bars = q.bars;
  if (isStr(q.prior_close)) out.prior_close = q.prior_close;
  if (isStr(q.volume)) out.volume = q.volume;
  if (isStr(q.rvol)) out.rvol = q.rvol;
  if (isStr(q.events)) out.events = q.events;
  if (isFin(q.bar_count)) out.bar_count = q.bar_count;
  if (isStr(q.feed_delay_note)) out.feed_delay_note = q.feed_delay_note;
  if (Array.isArray(q.reason_codes)) {
    out.reason_codes = q.reason_codes.filter(isStr);
  }
  return out;
}

export function isDirection(x: unknown): x is V2Direction {
  return x === "bullish" || x === "bearish" || x === "neutral" || x === "data_unavailable";
}

export function isRvolClass(x: unknown): x is RvolClass {
  return x === "normal" || x === "elevated" || x === "unusual";
}

export function isExpired(validThrough: string | null | undefined, now: Date = new Date()): boolean {
  if (!validThrough) return true;
  const t = Date.parse(validThrough);
  if (!Number.isFinite(t)) return true;
  return t <= now.getTime();
}

// Human-readable failure reason (never fabricate — pass-through with light polish).
export function humanFailureReason(code: string | null | undefined): string {
  if (!code) return "Analysis unavailable.";
  const map: Record<string, string> = {
    SNAPSHOT_MISSING: "Live market snapshot unavailable.",
    BARS_MISSING: "Intraday bars unavailable.",
    BARS_INSUFFICIENT: "Not enough intraday bars for a reliable read.",
    PRIOR_CLOSE_MISSING: "Prior close unavailable.",
    PROVIDER_TIMEOUT: "Market data provider timed out.",
    PROVIDER_ERROR: "Market data provider error.",
    RATE_LIMITED: "Rate limited by data provider.",
    AI_VALIDATION_FAILED: "AI response failed validation.",
    UPSTREAM_ERROR: "Upstream service error.",
  };
  return map[code] ?? "Analysis unavailable.";
}
