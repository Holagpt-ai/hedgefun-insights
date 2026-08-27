/**
 * Canonical Market Movers normalization, validation and current-list dedupe.
 * Reuses quote-integrity for contemporaneous snapshot checks. Does not impose
 * an arbitrary percentage cap; legitimate extreme moves remain eligible when
 * current and reference prices corroborate them.
 */

import {
  extractPolygonSnapshotFields,
  finiteOrNull,
  isoOrNull,
  normalizeSymbol,
  validateQuote,
} from "../quotes/integrity";

export type MoverSession = "regular" | "premarket" | "afterhours";

export type MoverRejectionReason =
  | "valid"
  | "invalid_current_price"
  | "invalid_reference_price"
  | "percentage_mismatch"
  | "decimal_scale_mismatch"
  | "adjustment_mismatch"
  | "stale_reference"
  | "session_mismatch"
  | "missing_corroboration"
  | "malformed_symbol";

export const SOURCE_POLYGON = "polygon";
export const SOURCE_MARKET_MOVERS_CACHE = "market_movers";
export const SOURCE_AFTER_HOURS_FEED = "after_hours_feed";

const SOURCE_RANK: Record<string, number> = {
  [SOURCE_POLYGON]: 0,
  [SOURCE_AFTER_HOURS_FEED]: 1,
  [SOURCE_MARKET_MOVERS_CACHE]: 2,
};

/** Same 10/100/1000 bands as quote-integrity contemporaneous scale checks. */
const SCALE_FACTORS = [10, 100, 1000] as const;
const SPLIT_FACTORS = [2, 3, 4, 5, 10, 20, 25, 40, 50, 100] as const;
const SCALE_TOLERANCE = 0.03;
const PERCENT_ABS_TOLERANCE = 1;
const PERCENT_REL_TOLERANCE = 0.08;
const STALE_REFERENCE_MS = 18 * 60 * 60 * 1000;
/** Matches screener `PROVIDER_FUTURE_SLACK_MS`. */
const PROVIDER_FUTURE_SLACK_MS = 5 * 60 * 1000;
/**
 * Magnitudes at or above this ratio are suspicious and require independent
 * corroboration. Magnitude alone is never an adjustment mismatch.
 */
const SUSPICIOUS_RATIO_FLOOR = 200;

export interface RawMoverInput {
  symbol: unknown;
  name?: unknown;
  price?: unknown;
  referencePrice?: unknown;
  providerPercent?: unknown;
  lastTradePrice?: unknown;
  minuteClose?: unknown;
  dayClose?: unknown;
  vwap?: unknown;
  volume?: unknown;
  providerAsOf?: unknown;
  session?: MoverSession | null;
  sessionDate?: unknown;
  source?: unknown;
  id?: unknown;
  adjustedClose?: unknown;
  unadjustedClose?: unknown;
  nowMs?: number;
}

export interface CanonicalMover {
  valid: boolean;
  reason: Exclude<MoverRejectionReason, "valid"> | null;
  symbol: string | null;
  name: string;
  price: number | null;
  reference_price: number | null;
  change: number | null;
  change_percent: number | null;
  volume: number | null;
  session: MoverSession | null;
  session_date: string | null;
  source: string;
  provider_as_of: string | null;
  id: string | null;
}

export interface MoverListRow {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

export function etSessionDate(ms: number = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ms));
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
}

export function canonicalChangePercent(currentPrice: number, referencePrice: number): number | null {
  if (!(currentPrice > 0) || !(referencePrice > 0)) return null;
  const pct = ((currentPrice - referencePrice) / referencePrice) * 100;
  return Number.isFinite(pct) ? pct : null;
}

function nearFactor(ratio: number, factor: number, tolerance = SCALE_TOLERANCE): boolean {
  if (!Number.isFinite(ratio) || ratio <= 0) return false;
  return Math.abs(ratio - factor) / factor <= tolerance;
}

function pairRatio(a: number, b: number): number | null {
  if (!(a > 0) || !(b > 0)) return null;
  return Math.max(a, b) / Math.min(a, b);
}

function isDecimalScalePair(a: number, b: number): boolean {
  const ratio = pairRatio(a, b);
  if (ratio === null) return false;
  return SCALE_FACTORS.some((f) => nearFactor(ratio, f));
}

function isSplitFactorPair(a: number, b: number): boolean {
  const ratio = pairRatio(a, b);
  if (ratio === null) return false;
  return SPLIT_FACTORS.some((f) => nearFactor(ratio, f));
}

function pricesAgree(a: number, b: number): boolean {
  if (!(a > 0) || !(b > 0)) return false;
  if (a === b) return true;
  const ratio = pairRatio(a, b);
  return ratio !== null && ratio <= 1 + SCALE_TOLERANCE;
}

function currentPrintsAgreeing(input: RawMoverInput, current: number): number {
  const extended = input.session === "premarket" || input.session === "afterhours";
  const candidates = [
    finiteOrNull(input.lastTradePrice),
    finiteOrNull(input.minuteClose),
    extended ? null : finiteOrNull(input.dayClose),
  ];
  return candidates.filter((v) => v !== null && v > 0 && pricesAgree(v, current)).length;
}

function hasAdjustmentEvidence(input: RawMoverInput, current: number, reference: number): boolean {
  const adjusted = finiteOrNull(input.adjustedClose);
  const unadjusted = finiteOrNull(input.unadjustedClose);
  if (adjusted !== null && adjusted > 0 && unadjusted !== null && unadjusted > 0 && !pricesAgree(adjusted, unadjusted)) {
    const ratio = pairRatio(adjusted, unadjusted);
    if (ratio !== null && (ratio >= SUSPICIOUS_RATIO_FLOOR || isDecimalScalePair(adjusted, unadjusted) || (isSplitFactorPair(adjusted, unadjusted) && ratio >= 1.8))) {
      return true;
    }
  }
  if (adjusted !== null && adjusted > 0 && unadjusted !== null && unadjusted > 0) {
    const currentLooksAdjusted = pricesAgree(adjusted, current) && pricesAgree(unadjusted, reference);
    const currentLooksUnadjusted = pricesAgree(unadjusted, current) && pricesAgree(adjusted, reference);
    if ((currentLooksAdjusted || currentLooksUnadjusted) && !pricesAgree(adjusted, unadjusted)) {
      return true;
    }
  }
  return false;
}

function referenceIndependentlyCorroborated(input: RawMoverInput, reference: number): boolean {
  const adjusted = finiteOrNull(input.adjustedClose);
  const unadjusted = finiteOrNull(input.unadjustedClose);
  // Both close series present and in agreement with the reference — not a split remnant.
  return (
    adjusted !== null &&
    adjusted > 0 &&
    unadjusted !== null &&
    unadjusted > 0 &&
    pricesAgree(adjusted, unadjusted) &&
    pricesAgree(adjusted, reference)
  );
}

function percentsAgree(a: number, b: number): boolean {
  const abs = Math.abs(a - b);
  if (abs <= PERCENT_ABS_TOLERANCE) return true;
  const denom = Math.max(Math.abs(a), Math.abs(b), 1);
  return abs / denom <= PERCENT_REL_TOLERANCE;
}

function isRatioVersusPercent(provider: number, canonical: number): boolean {
  if (!(Math.abs(provider) > 0) || !(Math.abs(canonical) > 0)) return false;
  if (Math.sign(provider) !== Math.sign(canonical) && provider !== 0 && canonical !== 0) {
    return false;
  }
  const ratio = Math.abs(canonical) / Math.abs(provider);
  return nearFactor(ratio, 100) || nearFactor(ratio, 0.01);
}

function nameFrom(raw: unknown, symbol: string): string {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return symbol;
}

function sourceFrom(raw: unknown): string {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return SOURCE_POLYGON;
}

function fail(
  input: RawMoverInput,
  symbol: string | null,
  reason: Exclude<MoverRejectionReason, "valid">,
): CanonicalMover {
  return {
    valid: false,
    reason,
    symbol,
    name: nameFrom(input.name, symbol ?? ""),
    price: null,
    reference_price: null,
    change: null,
    change_percent: null,
    volume: finiteOrNull(input.volume),
    session: input.session ?? null,
    session_date: typeof input.sessionDate === "string" ? input.sessionDate : null,
    source: sourceFrom(input.source),
    provider_as_of: isoOrNull(input.providerAsOf),
    id: typeof input.id === "string" ? input.id : null,
  };
}

export function validateMover(input: RawMoverInput): CanonicalMover {
  const symbol = normalizeSymbol(input.symbol);
  if (!symbol) return fail(input, null, "malformed_symbol");

  // Premarket/after-hours current prints are last trade / minute. Regular close is
  // the reference for after-hours and must not be treated as contemporaneous.
  const extended = input.session === "premarket" || input.session === "afterhours";
  const quote = validateQuote({
    symbol,
    price: input.price,
    lastTradePrice: input.lastTradePrice,
    minuteClose: input.minuteClose,
    dayClose: extended ? undefined : input.dayClose,
    vwap: extended ? undefined : input.vwap,
    priorClose: input.referencePrice,
    volume: input.volume,
    quoteTimestamp: input.providerAsOf,
    adjustedClose: input.adjustedClose,
    unadjustedClose: input.unadjustedClose,
  }, { provider: sourceFrom(input.source) });

  if (!quote.valid) {
    if (quote.rejection_reason === "DECIMAL_SCALE_MISMATCH") {
      return fail(input, symbol, "decimal_scale_mismatch");
    }
    if (quote.rejection_reason === "SPLIT_ADJUSTMENT_MISMATCH") {
      return fail(input, symbol, "adjustment_mismatch");
    }
    if (
      quote.rejection_reason === "MISSING_QUOTE" ||
      quote.rejection_reason === "NON_POSITIVE_PRICE" ||
      quote.rejection_reason === "MALFORMED_PRICE"
    ) {
      return fail(input, symbol, "invalid_current_price");
    }
    return fail(input, symbol, "invalid_current_price");
  }

  const current = finiteOrNull(input.price) ?? quote.price;
  if (current === null || !(current > 0)) {
    return fail(input, symbol, "invalid_current_price");
  }

  if (input.referencePrice === undefined || input.referencePrice === null) {
    return fail(input, symbol, "missing_corroboration");
  }
  const reference = finiteOrNull(input.referencePrice);
  if (reference === null || !(reference > 0)) {
    return fail(input, symbol, "invalid_reference_price");
  }

  if (isDecimalScalePair(current, reference)) {
    return fail(input, symbol, "decimal_scale_mismatch");
  }

  if (hasAdjustmentEvidence(input, current, reference)) {
    return fail(input, symbol, "adjustment_mismatch");
  }

  const adjusted = finiteOrNull(input.adjustedClose);
  const unadjusted = finiteOrNull(input.unadjustedClose);
  if (adjusted !== null && adjusted > 0 && unadjusted !== null && unadjusted > 0) {
    if (isDecimalScalePair(adjusted, unadjusted) || isSplitFactorPair(adjusted, unadjusted)) {
      const ratio = pairRatio(adjusted, unadjusted);
      if (ratio !== null && ratio >= 1.8) {
        return fail(input, symbol, "adjustment_mismatch");
      }
    }
  }

  const recapRatio = pairRatio(current, reference);
  if (recapRatio !== null && recapRatio >= SUSPICIOUS_RATIO_FLOOR) {
    // Provider percent derived from this same pair is not independent evidence.
    const currentOk = currentPrintsAgreeing(input, current) >= 2;
    const referenceOk = referenceIndependentlyCorroborated(input, reference);
    if (!currentOk || !referenceOk) {
      return fail(input, symbol, "missing_corroboration");
    }
  }

  const canonicalPct = canonicalChangePercent(current, reference);
  if (canonicalPct === null) return fail(input, symbol, "invalid_reference_price");

  const providerPct = finiteOrNull(input.providerPercent);
  if (providerPct !== null && isRatioVersusPercent(providerPct, canonicalPct) && !percentsAgree(providerPct, canonicalPct)) {
    return fail(input, symbol, "percentage_mismatch");
  }

  const nowMs = typeof input.nowMs === "number" && Number.isFinite(input.nowMs) ? input.nowMs : Date.now();
  const asOf = isoOrNull(input.providerAsOf);
  if (asOf) {
    const asOfMs = Date.parse(asOf);
    if (Number.isFinite(asOfMs)) {
      if (asOfMs > nowMs + PROVIDER_FUTURE_SLACK_MS) {
        return fail(input, symbol, "stale_reference");
      }
      if (nowMs - asOfMs > STALE_REFERENCE_MS) {
        return fail(input, symbol, "stale_reference");
      }
    }
  }
  const sessionDate = typeof input.sessionDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.sessionDate)
    ? input.sessionDate
    : null;
  if (sessionDate && sessionDate !== etSessionDate(nowMs) && input.source === SOURCE_MARKET_MOVERS_CACHE) {
    return fail(input, symbol, "stale_reference");
  }

  const volume = finiteOrNull(input.volume);

  return {
    valid: true,
    reason: null,
    symbol,
    name: nameFrom(input.name, symbol),
    price: current,
    reference_price: reference,
    change: current - reference,
    change_percent: canonicalPct,
    volume: volume !== null && volume >= 0 ? volume : null,
    session: input.session ?? null,
    session_date: sessionDate,
    source: sourceFrom(input.source),
    provider_as_of: asOf,
    id: typeof input.id === "string" ? input.id : null,
  };
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

export function moverFromExtendedObservation(
  input: {
    symbol: unknown;
    name?: unknown;
    extendedLast: unknown;
    regularClose: unknown;
    volume?: unknown;
    providerAsOf?: unknown;
    id?: unknown;
    source?: unknown;
    changePercent?: unknown;
  },
  nowMs: number = Date.now(),
): CanonicalMover {
  return validateMover({
    symbol: input.symbol,
    name: input.name,
    price: input.extendedLast,
    referencePrice: input.regularClose,
    providerPercent: input.changePercent,
    lastTradePrice: input.extendedLast,
    minuteClose: input.extendedLast,
    volume: input.volume,
    providerAsOf: input.providerAsOf,
    session: "afterhours",
    sessionDate: etSessionDate(nowMs),
    source: input.source ?? SOURCE_AFTER_HOURS_FEED,
    id: input.id,
    nowMs,
  });
}

export function polygonTickersFromResponse(res: unknown): unknown[] {
  if (Array.isArray(res)) return res;
  if (isPlainObject(res) && Array.isArray(res.tickers)) return res.tickers;
  return [];
}

/**
 * Map a Polygon snapshot ticker (or market-data enrichment) into a validated mover.
 * Regular session uses day close vs previous regular close — never todaysChangePerc
 * as the displayed percent.
 */
export function moverFromPolygonTicker(
  raw: unknown,
  session: MoverSession,
  nowMs: number = Date.now(),
): CanonicalMover {
  if (!isPlainObject(raw)) {
    return fail({ symbol: null }, null, "malformed_symbol");
  }
  const extracted = extractPolygonSnapshotFields(raw, raw.ticker ?? raw.symbol);
  const lastTrade = isPlainObject(raw.lastTrade) ? raw.lastTrade : {};
  const min = isPlainObject(raw.min) ? raw.min : {};
  const day = isPlainObject(raw.day) ? raw.day : {};
  const prevDay = isPlainObject(raw.prevDay) ? raw.prevDay : {};
  const lastTradePrice = finiteOrNull(lastTrade.p);
  const minuteClose = finiteOrNull(min.c);
  const dayClose = finiteOrNull(day.c);
  const prevClose = finiteOrNull(prevDay.c);

  let current: number | null = null;
  let reference: number | null = null;
  if (session === "regular") {
    current = dayClose;
    reference = prevClose;
  } else if (session === "premarket") {
    current = (lastTradePrice !== null && lastTradePrice > 0 ? lastTradePrice : null)
      ?? (minuteClose !== null && minuteClose > 0 ? minuteClose : null);
    reference = prevClose;
  } else {
    current = (lastTradePrice !== null && lastTradePrice > 0 ? lastTradePrice : null)
      ?? (minuteClose !== null && minuteClose > 0 ? minuteClose : null);
    reference = dayClose;
  }

  const providerPct = finiteOrNull(raw.todaysChangePerc ?? raw.change_percent ?? raw.changePercent);
  const sessionDate = etSessionDate(nowMs);

  if (session === "regular" && dayClose !== null && dayClose > 0 && current === dayClose && providerPct !== null && prevClose !== null && prevClose > 0) {
    const dayPct = canonicalChangePercent(dayClose, prevClose);
    const extPrice = (lastTradePrice !== null && lastTradePrice > 0 ? lastTradePrice : null)
      ?? (minuteClose !== null && minuteClose > 0 ? minuteClose : null);
    if (extPrice !== null && dayPct !== null) {
      const extPct = canonicalChangePercent(extPrice, prevClose);
      if (
        extPct !== null &&
        !percentsAgree(providerPct, dayPct) &&
        percentsAgree(providerPct, extPct) &&
        !percentsAgree(extPct, dayPct)
      ) {
        return fail({
          symbol: extracted?.symbol ?? raw.ticker ?? raw.symbol,
          name: raw.name,
          session,
          sessionDate,
          source: SOURCE_POLYGON,
          providerAsOf: extracted?.quoteTimestamp ?? lastTrade.t ?? raw.updated,
        }, normalizeSymbol(extracted?.symbol ?? raw.ticker ?? raw.symbol), "session_mismatch");
      }
    }
  }

  return validateMover({
    symbol: extracted?.symbol ?? raw.ticker ?? raw.symbol,
    name: raw.name ?? (isPlainObject(raw.details) ? raw.details.name : null),
    price: current,
    referencePrice: reference,
    providerPercent: providerPct,
    lastTradePrice,
    minuteClose,
    dayClose,
    vwap: extracted?.vwap,
    volume: finiteOrNull(day.v) ?? finiteOrNull(min.av) ?? finiteOrNull(min.v),
    providerAsOf: extracted?.quoteTimestamp ?? lastTrade.t ?? raw.updated,
    session,
    sessionDate,
    source: SOURCE_POLYGON,
    nowMs,
  });
}

/**
 * Cached `market_movers` rows have no reference price. Extreme or unverifiable
 * percents are not presented as current verified movers.
 */
export function validateCachedMoverRow(raw: unknown, nowMs: number = Date.now()): CanonicalMover {
  if (!isPlainObject(raw)) return fail({ symbol: null }, null, "malformed_symbol");
  const price = finiteOrNull(raw.price);
  const pct = finiteOrNull(raw.change_percent);
  const sessionDate = typeof raw.session_date === "string" ? raw.session_date : null;
  return validateMover({
    symbol: raw.symbol,
    name: raw.name,
    price,
    referencePrice: null,
    providerPercent: pct,
    volume: raw.volume,
    providerAsOf: raw.updated_at,
    sessionDate,
    source: SOURCE_MARKET_MOVERS_CACHE,
    id: typeof raw.id === "string" ? raw.id : null,
    nowMs,
  });
}

export function toMoverListRow(mover: CanonicalMover): MoverListRow | null {
  if (!mover.valid || !mover.symbol || mover.price === null || mover.change === null || mover.change_percent === null) {
    return null;
  }
  return {
    symbol: mover.symbol,
    name: mover.name,
    price: mover.price,
    change: mover.change,
    changePercent: mover.change_percent,
    volume: mover.volume !== null && mover.volume >= 0 ? mover.volume : 0,
  };
}

function eventTimeMs(iso: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function sourceRank(source: string): number {
  return SOURCE_RANK[source] ?? 50;
}

/**
 * Current-list identity: normalized symbol + session + ET session date.
 * Historical rows on a different session_date are not collapsed together.
 */
export function currentMoverIdentity(row: CanonicalMover): string | null {
  if (!row.symbol) return null;
  const session = row.session ?? "_";
  const date = row.session_date ?? "_";
  return `${row.symbol}|${session}|${date}`;
}

function compareWinners(a: CanonicalMover, b: CanonicalMover): number {
  if (a.valid !== b.valid) return a.valid ? -1 : 1;
  const dt = eventTimeMs(b.provider_as_of) - eventTimeMs(a.provider_as_of);
  if (dt !== 0) return dt;
  const src = sourceRank(a.source) - sourceRank(b.source);
  if (src !== 0) return src;
  const va = a.volume ?? -1;
  const vb = b.volume ?? -1;
  if (va !== vb) return vb - va;
  const ida = a.id ?? a.symbol ?? "";
  const idb = b.id ?? b.symbol ?? "";
  return ida.localeCompare(idb);
}

export type MoverSort = "percent_desc" | "percent_asc" | "volume_desc";

export function selectCanonicalCurrentMovers(
  rows: CanonicalMover[],
  opts?: { sessionDate?: string; sort?: MoverSort },
): CanonicalMover[] {
  const sessionDate = opts?.sessionDate;
  const eligible = rows.filter((r) => {
    if (!r.valid) return false;
    if (sessionDate && r.session_date && r.session_date !== sessionDate) return false;
    return true;
  });

  const ranked = [...eligible].sort(compareWinners);
  const seen = new Set<string>();
  const winners: CanonicalMover[] = [];
  for (const row of ranked) {
    const key = currentMoverIdentity(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    winners.push(row);
  }

  const sort = opts?.sort ?? "percent_desc";
  winners.sort((a, b) => {
    if (sort === "volume_desc") {
      const dv = (b.volume ?? 0) - (a.volume ?? 0);
      if (dv !== 0) return dv;
    } else {
      const pa = a.change_percent ?? 0;
      const pb = b.change_percent ?? 0;
      const dp = sort === "percent_asc" ? pa - pb : pb - pa;
      if (dp !== 0) return dp;
    }
    return compareWinners(a, b);
  });
  return winners;
}

export function mapPolygonMovers(
  raw: unknown,
  session: MoverSession,
  opts?: { nowMs?: number; sort?: MoverSort },
): { rows: MoverListRow[]; rejected: number } {
  const nowMs = opts?.nowMs ?? Date.now();
  const tickers = polygonTickersFromResponse(raw);
  const validated = tickers.map((t) => moverFromPolygonTicker(t, session, nowMs));
  const winners = selectCanonicalCurrentMovers(validated, {
    sessionDate: etSessionDate(nowMs),
    sort: opts?.sort,
  });
  const rows = winners.map(toMoverListRow).filter((r): r is MoverListRow => r !== null);
  return { rows, rejected: validated.length - winners.length };
}

export function moversForAi(rows: CanonicalMover[]): CanonicalMover[] {
  return rows.filter((r) => r.valid && r.price !== null && r.change_percent !== null);
}

export function mapAfterHoursFeed(
  rows: unknown[],
  opts?: { nowMs?: number; sort?: MoverSort },
): MoverListRow[] {
  const nowMs = opts?.nowMs ?? Date.now();
  const validated = rows.map((raw) => {
    if (!isPlainObject(raw)) return fail({ symbol: null }, null, "malformed_symbol");
    return moverFromExtendedObservation({
      symbol: raw.symbol,
      name: raw.company_name ?? raw.name,
      extendedLast: raw.extended_last ?? raw.extendedLast,
      regularClose: raw.regular_close ?? raw.regularClose,
      volume: raw.volume,
      providerAsOf: raw.provider_as_of ?? raw.providerAsOf,
      id: raw.id,
      changePercent: raw.change_percent ?? raw.changePercent,
      source: raw.source ?? SOURCE_AFTER_HOURS_FEED,
    }, nowMs);
  });
  return selectCanonicalCurrentMovers(validated, {
    sessionDate: etSessionDate(nowMs),
    sort: opts?.sort,
  }).map(toMoverListRow).filter((r): r is MoverListRow => r !== null);
}

export function currentMoversEmptyMessage(opts: {
  hasSearchQuery: boolean;
  marketClosed: boolean;
}): string {
  if (opts.hasSearchQuery) return "No results match your search.";
  if (opts.marketClosed) {
    return "Markets are currently closed. Data will be available when markets reopen.";
  }
  return "Market movers are currently unavailable.";
}

export type MoverCategory = "gainer" | "loser" | "active" | "premarket" | "afterhours";

export function presentCanonicalMovers(
  movers: CanonicalMover[],
  category: MoverCategory,
  limit = 10,
  nowMs: number = Date.now(),
): {
  movers: Array<{
    symbol: string;
    name: string;
    price: number;
    change_percent: number;
    volume: number | null;
    session_date: string | null;
    type: MoverCategory;
  }>;
  status: "available" | "empty";
} {
  let sort: MoverSort = "percent_desc";
  if (category === "loser") sort = "percent_asc";
  if (category === "active") sort = "volume_desc";
  let filtered = movers;
  if (category === "gainer") filtered = movers.filter((m) => (m.change_percent ?? 0) > 0);
  if (category === "loser") filtered = movers.filter((m) => (m.change_percent ?? 0) < 0);
  const winners = selectCanonicalCurrentMovers(filtered, {
    sessionDate: etSessionDate(nowMs),
    sort,
  });
  const rows = winners
    .slice(0, Math.max(1, limit))
    .filter((m) => m.symbol && m.price !== null && m.change_percent !== null)
    .map((m) => ({
      symbol: m.symbol as string,
      name: m.name,
      price: m.price as number,
      change_percent: m.change_percent as number,
      volume: m.volume,
      session_date: m.session_date,
      type: category,
    }));
  return { movers: rows, status: rows.length > 0 ? "available" : "empty" };
}

export function formatMoverRejectionLog(mover: CanonicalMover): string {
  return [
    "mover_rejected",
    `symbol=${mover.symbol ?? "unknown"}`,
    `provider=${mover.source}`,
    `provider_as_of=${mover.provider_as_of ?? "none"}`,
    `reason=${mover.reason ?? "none"}`,
  ].join(" ");
}
