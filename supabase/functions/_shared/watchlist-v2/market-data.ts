// Provider fetch + bar normalization for Watchlist V2.
// Required providers (snapshot, minute bars) surface transport failures explicitly.
// Optional providers (news, earnings) degrade gracefully.

import type { IntradayBar } from "./contract.ts";
import { etParts } from "./session.ts";
import { sanitize } from "./sanitize.ts";

export type ProviderOutcome<T = unknown> =
  | { kind: "ok"; body: T }
  | { kind: "transport_failure"; code: "RATE_LIMITED" | "PROVIDER_TIMEOUT" | "PROVIDER_ERROR" };

export async function fetchWithOutcome(
  url: string,
  timeoutMs = 8000,
): Promise<ProviderOutcome> {
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    console.warn("[wl-v2] provider fetch error:", sanitize(e));
    return { kind: "transport_failure", code: "PROVIDER_TIMEOUT" };
  }
  if (res.status === 429) {
    try { await res.body?.cancel(); } catch { /* noop */ }
    return { kind: "transport_failure", code: "RATE_LIMITED" };
  }
  if (!res.ok) {
    try { await res.body?.cancel(); } catch { /* noop */ }
    return { kind: "transport_failure", code: "PROVIDER_ERROR" };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { kind: "transport_failure", code: "PROVIDER_ERROR" };
  }
  return { kind: "ok", body };
}

// ── Bar normalization ────────────────────────────────────────────────────
export interface BarNormalizeResult {
  bars: IntradayBar[];
  rejected_count: number;
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function etDateOf(ms: number): string {
  return etParts(new Date(ms)).date;
}

/**
 * @param resultsRaw - Raw `results` array from Polygon /v2/aggs.
 * @param sessionDate - The resolved ET session date; bars outside are rejected.
 * @param now - Reference clock; future bars are rejected.
 */
export function normalizeBars(
  resultsRaw: unknown,
  sessionDate: string,
  now: Date,
): BarNormalizeResult {
  if (!Array.isArray(resultsRaw)) return { bars: [], rejected_count: 0 };
  const nowMs = now.getTime();
  const kept: IntradayBar[] = [];
  let rejected = 0;
  for (const raw of resultsRaw) {
    if (!isPlainObject(raw)) { rejected++; continue; }
    const { t, o, h, l, c, v } = raw;
    if (![t, o, h, l, c, v].every((n) => typeof n === "number" && Number.isFinite(n))) { rejected++; continue; }
    if ((v as number) < 0) { rejected++; continue; }
    if ((h as number) < (l as number)) { rejected++; continue; }
    if ((o as number) <= 0 || (h as number) <= 0 || (l as number) <= 0 || (c as number) <= 0) { rejected++; continue; }
    if ((o as number) < (l as number) || (o as number) > (h as number)) { rejected++; continue; }
    if ((c as number) < (l as number) || (c as number) > (h as number)) { rejected++; continue; }
    if ((t as number) > nowMs) { rejected++; continue; }
    if (etDateOf(t as number) !== sessionDate) { rejected++; continue; }
    kept.push({ t: t as number, o: o as number, h: h as number, l: l as number, c: c as number, v: v as number });
  }
  // Dedupe on t, keep LAST occurrence
  const byT = new Map<number, IntradayBar>();
  for (const b of kept) byT.set(b.t, b);
  const bars = [...byT.values()].sort((a, b) => a.t - b.t);
  return { bars, rejected_count: rejected };
}

// ── Snapshot freshness / basis ───────────────────────────────────────────
const STALE_MS = 45 * 60 * 1000;

export interface SnapshotAssessment {
  quality: "ok" | "missing" | "stale" | "malformed";
  lastTradeTs: number | null;
  priorClose: number | null;   // prevDay.c > 0 finite
  dayClose: number | null;
  dayVolume: number | null;
}

export function assessSnapshot(bodyRaw: unknown, now: Date): SnapshotAssessment {
  if (!isPlainObject(bodyRaw)) return { quality: "malformed", lastTradeTs: null, priorClose: null, dayClose: null, dayVolume: null };
  const t = (bodyRaw as Record<string, unknown>).ticker;
  const tick = isPlainObject(t) ? t : null;
  if (!tick) return { quality: "missing", lastTradeTs: null, priorClose: null, dayClose: null, dayVolume: null };
  const prevDay = isPlainObject(tick.prevDay) ? tick.prevDay : {};
  const day = isPlainObject(tick.day) ? tick.day : {};
  const lastTrade = isPlainObject(tick.lastTrade) ? tick.lastTrade : {};
  const lastQuote = isPlainObject(tick.lastQuote) ? tick.lastQuote : {};
  const min = isPlainObject(tick.min) ? tick.min : {};

  // Permitted freshness candidates. Polygon documents lastTrade/lastQuote as
  // optional on delayed plans; ticker.updated (ns) and ticker.min.t (ms) are
  // valid fallbacks. Aggregate bars are NOT used here.
  const nowMs = now.getTime();
  const futureCapMs = nowMs + 5 * 60 * 1000;

  const normalizeCandidate = (v: unknown, unit: "auto" | "ms"): number | null => {
    if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
    // Auto-detect ns vs ms: values > 1e14 look like nanoseconds.
    let ms = unit === "ms" ? v : (v > 1e14 ? Math.round(v / 1e6) : v);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    // Reject implausibly old (< year 2001) and >5min future timestamps.
    if (ms < 1_000_000_000_000) return null;
    if (ms > futureCapMs) return null;
    return ms;
  };

  const candidates: number[] = [];
  const c1 = normalizeCandidate(lastTrade.t, "auto"); if (c1 !== null) candidates.push(c1);
  const c2 = normalizeCandidate(lastQuote.t, "auto"); if (c2 !== null) candidates.push(c2);
  const c3 = normalizeCandidate((tick as Record<string, unknown>).updated, "auto"); if (c3 !== null) candidates.push(c3);
  const c4 = normalizeCandidate(min.t, "ms"); if (c4 !== null) candidates.push(c4);

  const tsMs = candidates.length ? Math.max(...candidates) : null;

  const priorC = typeof prevDay.c === "number" && Number.isFinite(prevDay.c) && prevDay.c > 0 ? prevDay.c : null;
  const dayC = typeof day.c === "number" && Number.isFinite(day.c) && day.c > 0 ? day.c : null;
  const dayV = typeof day.v === "number" && Number.isFinite(day.v) && day.v >= 0 ? day.v : null;

  let quality: SnapshotAssessment["quality"];
  if (tsMs === null) quality = "missing";
  else if (nowMs - tsMs > STALE_MS) quality = "stale";
  else quality = "ok";

  return { quality, lastTradeTs: tsMs, priorClose: priorC, dayClose: dayC, dayVolume: dayV };
}


// ── Price/change/volume basis ────────────────────────────────────────────
export interface BasisComputation {
  price: number | null;
  change_pct: number | null;
  volume: number | null;
}

export function computeBasis(
  bars: IntradayBar[],
  snapshot: SnapshotAssessment,
): BasisComputation {
  const lastBar = bars.length ? bars[bars.length - 1] : null;
  const price = lastBar ? lastBar.c : snapshot.dayClose;
  const prior = snapshot.priorClose;
  const change_pct =
    price !== null && prior !== null && prior > 0
      ? ((price - prior) / prior) * 100
      : null;
  const cumVol = bars.reduce((s, b) => s + b.v, 0);
  const volume =
    bars.length > 0
      ? cumVol
      : (snapshot.dayVolume !== null && snapshot.dayVolume >= 0 ? snapshot.dayVolume : null);
  return { price, change_pct, volume };
}
