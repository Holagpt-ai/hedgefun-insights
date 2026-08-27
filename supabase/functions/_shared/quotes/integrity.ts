/**
 * Centralized quote-validation and normalization boundary.
 * Shared conceptually with supabase/functions/_shared/quotes/integrity.ts.
 *
 * Rejects malformed, non-positive, decimal-scaled, currency-mismatched and
 * split-inconsistent snapshots. Does not reject a legitimate high-priced
 * security merely because its price is high. Never hardcodes issuers.
 */

export const TICKER_REGEX = /^[A-Z][A-Z0-9.-]{0,14}$/;

export type QuoteRejectionReason =
  | "MISSING_SYMBOL"
  | "MISSING_QUOTE"
  | "MALFORMED_PRICE"
  | "NON_POSITIVE_PRICE"
  | "MALFORMED_CHANGE_PCT"
  | "MALFORMED_VOLUME"
  | "MISSING_QUOTE_TIMESTAMP"
  | "DECIMAL_SCALE_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "SPLIT_ADJUSTMENT_MISMATCH"
  | "IMPLAUSIBLE_DISCONTINUITY";

export const USER_SNAPSHOT_UNAVAILABLE = "Current market snapshot unavailable";

const REASON_USER_TEXT: Record<QuoteRejectionReason, string> = {
  MISSING_SYMBOL: USER_SNAPSHOT_UNAVAILABLE,
  MISSING_QUOTE: "Market snapshot unavailable.",
  MALFORMED_PRICE: USER_SNAPSHOT_UNAVAILABLE,
  NON_POSITIVE_PRICE: USER_SNAPSHOT_UNAVAILABLE,
  MALFORMED_CHANGE_PCT: USER_SNAPSHOT_UNAVAILABLE,
  MALFORMED_VOLUME: USER_SNAPSHOT_UNAVAILABLE,
  MISSING_QUOTE_TIMESTAMP: USER_SNAPSHOT_UNAVAILABLE,
  DECIMAL_SCALE_MISMATCH: USER_SNAPSHOT_UNAVAILABLE,
  CURRENCY_MISMATCH: USER_SNAPSHOT_UNAVAILABLE,
  SPLIT_ADJUSTMENT_MISMATCH: USER_SNAPSHOT_UNAVAILABLE,
  IMPLAUSIBLE_DISCONTINUITY: USER_SNAPSHOT_UNAVAILABLE,
};

/** Internal codes that must never be shown as production copy. */
export const INTERNAL_FAILURE_CODES: ReadonlySet<string> = new Set([
  "SNAPSHOT_MISSING",
  "SNAPSHOT_STALE",
  "SNAPSHOT_MALFORMED",
  "QUOTE_REJECTED",
  "INSUFFICIENT_EVIDENCE",
  "PRICE_UNAVAILABLE",
  "PRIOR_CLOSE_UNAVAILABLE",
  "BARS_MISSING",
  "BARS_INSUFFICIENT",
  "BARS_MALFORMED",
  "VOLUME_UNAVAILABLE",
  "PROVIDER_UNAVAILABLE",
  "MISSING_SYMBOL",
  "MISSING_QUOTE",
  "MALFORMED_PRICE",
  "NON_POSITIVE_PRICE",
  "MALFORMED_CHANGE_PCT",
  "MALFORMED_VOLUME",
  "MISSING_QUOTE_TIMESTAMP",
  "DECIMAL_SCALE_MISMATCH",
  "CURRENCY_MISMATCH",
  "SPLIT_ADJUSTMENT_MISMATCH",
  "IMPLAUSIBLE_DISCONTINUITY",
]);

const CODE_USER_TEXT: Record<string, string> = {
  SNAPSHOT_MISSING: "Market snapshot unavailable.",
  SNAPSHOT_STALE: "Market snapshot is stale.",
  SNAPSHOT_MALFORMED: USER_SNAPSHOT_UNAVAILABLE,
  QUOTE_REJECTED: USER_SNAPSHOT_UNAVAILABLE,
  INSUFFICIENT_EVIDENCE: "Insufficient Data",
  PRICE_UNAVAILABLE: "Current price unavailable.",
  PRIOR_CLOSE_UNAVAILABLE: "Prior close unavailable.",
  BARS_MISSING: "Intraday bars unavailable.",
  BARS_INSUFFICIENT: "Not enough intraday bars for this session.",
  BARS_MALFORMED: "Intraday bar payload malformed.",
  VOLUME_UNAVAILABLE: "Volume unavailable.",
  PROVIDER_UNAVAILABLE: "Required upstream provider unavailable.",
  ...REASON_USER_TEXT,
};

export function humanizeFailureCode(code: string | null | undefined): string {
  if (!code || !code.trim()) return "Analysis could not be validated";
  const trimmed = code.trim();
  if (CODE_USER_TEXT[trimmed]) return CODE_USER_TEXT[trimmed];
  if (INTERNAL_FAILURE_CODES.has(trimmed)) return USER_SNAPSHOT_UNAVAILABLE;
  // Already human text (letters + spaces) is allowed through; raw codes are not.
  if (/^[A-Z][A-Z0-9_]+$/.test(trimmed)) return "Analysis could not be validated";
  return trimmed;
}

export function quoteUserText(reason: QuoteRejectionReason | null): string {
  if (!reason) return USER_SNAPSHOT_UNAVAILABLE;
  return REASON_USER_TEXT[reason] ?? USER_SNAPSHOT_UNAVAILABLE;
}

export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  return TICKER_REGEX.test(t) ? t : null;
}

/** Finite number or null — never coerces missing values to 0. */
export function finiteOrNull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function isMalformedNumber(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "number") return !Number.isFinite(v);
  if (typeof v === "string") {
    if (v.trim() === "") return false;
    return !Number.isFinite(Number(v));
  }
  return true;
}

export function isoOrNull(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) {
    const ms = v > 1e14 ? Math.round(v / 1e6) : v;
    if (!Number.isFinite(ms) || ms < 1_000_000_000_000) return null;
    return new Date(ms).toISOString();
  }
  if (typeof v !== "string" || !v.trim()) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

const USD_ALIASES = new Set([
  "USD",
  "US DOLLAR",
  "UNITED STATES DOLLAR",
  "UNITED STATES DOLLARS",
]);

export function normalizeCurrency(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  return raw.trim().toUpperCase().replace(/[._]/g, " ").replace(/\s+/g, " ");
}

export function isUsdCurrency(raw: unknown): boolean {
  const c = normalizeCurrency(raw);
  return c !== null && USD_ALIASES.has(c);
}

const SCALE_FACTORS = [10, 100, 1000] as const;
const SPLIT_FACTORS = [2, 3, 4, 5, 10, 20, 25, 40, 50, 100] as const;
const SCALE_TOLERANCE = 0.03;

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

export interface RawQuoteFields {
  symbol: unknown;
  price?: unknown;
  changePct?: unknown;
  volume?: unknown;
  quoteTimestamp?: unknown;
  currency?: unknown;
  lastTradePrice?: unknown;
  minuteClose?: unknown;
  dayClose?: unknown;
  vwap?: unknown;
  priorClose?: unknown;
  adjustedClose?: unknown;
  unadjustedClose?: unknown;
  priorSnapshotPrice?: unknown;
}

export interface QuoteDiagnostic {
  symbol: string | null;
  provider: string;
  quote_timestamp: string | null;
  rejected_field: string | null;
  reason: QuoteRejectionReason | null;
}

export interface NormalizedQuote {
  valid: boolean;
  rejection_reason: QuoteRejectionReason | null;
  rejected_field: string | null;
  symbol: string | null;
  price: number | null;
  change_pct: number | null;
  volume: number | null;
  quote_timestamp: string | null;
  currency: string | null;
  /** Retained for diagnostics; never log this object wholesale. */
  raw: {
    price: unknown;
    change_pct: unknown;
    volume: unknown;
    last_trade: unknown;
    minute_close: unknown;
    day_close: unknown;
    vwap: unknown;
    prior_close: unknown;
  };
  diagnostic: QuoteDiagnostic;
}

function fail(
  input: RawQuoteFields,
  opts: { provider: string; symbol: string | null; ts: string | null; currency: string | null },
  reason: QuoteRejectionReason,
  field: string,
): NormalizedQuote {
  return {
    valid: false,
    rejection_reason: reason,
    rejected_field: field,
    symbol: opts.symbol,
    price: null,
    change_pct: null,
    volume: null,
    quote_timestamp: opts.ts,
    currency: opts.currency,
    raw: rawBundle(input),
    diagnostic: {
      symbol: opts.symbol,
      provider: opts.provider,
      quote_timestamp: opts.ts,
      rejected_field: field,
      reason,
    },
  };
}

function rawBundle(input: RawQuoteFields): NormalizedQuote["raw"] {
  return {
    price: input.price ?? null,
    change_pct: input.changePct ?? null,
    volume: input.volume ?? null,
    last_trade: input.lastTradePrice ?? null,
    minute_close: input.minuteClose ?? null,
    day_close: input.dayClose ?? null,
    vwap: input.vwap ?? null,
    prior_close: input.priorClose ?? null,
  };
}

/**
 * Contemporaneous last-print candidates used to detect decimal scaling.
 * Prior close is intentionally excluded — a gap day is not a scale error.
 */
function contemporaneousPrices(input: RawQuoteFields): Array<{ field: string; value: number }> {
  const out: Array<{ field: string; value: number }> = [];
  const push = (field: string, raw: unknown) => {
    const n = finiteOrNull(raw);
    if (n !== null && n > 0) out.push({ field, value: n });
  };
  push("price", input.price);
  push("lastTradePrice", input.lastTradePrice);
  push("minuteClose", input.minuteClose);
  push("dayClose", input.dayClose);
  push("vwap", input.vwap);
  // Deduplicate identical field/value pairs while keeping distinct fields.
  return out;
}

export function validateQuote(
  input: RawQuoteFields,
  opts?: { provider?: string },
): NormalizedQuote {
  const provider = opts?.provider ?? "polygon";
  const symbol = normalizeSymbol(input.symbol);
  const ts = isoOrNull(input.quoteTimestamp);
  const currency = normalizeCurrency(input.currency);
  const ctx = { provider, symbol, ts, currency };

  if (!symbol) return fail(input, ctx, "MISSING_SYMBOL", "symbol");

  if (isMalformedNumber(input.price)) {
    return fail(input, ctx, "MALFORMED_PRICE", "price");
  }
  for (const [field, raw] of [
    ["lastTradePrice", input.lastTradePrice],
    ["minuteClose", input.minuteClose],
    ["dayClose", input.dayClose],
    ["vwap", input.vwap],
    ["priorClose", input.priorClose],
  ] as const) {
    if (isMalformedNumber(raw)) return fail(input, ctx, "MALFORMED_PRICE", field);
  }

  if (input.changePct !== undefined && isMalformedNumber(input.changePct)) {
    return fail(input, ctx, "MALFORMED_CHANGE_PCT", "changePct");
  }
  if (input.volume !== undefined && isMalformedNumber(input.volume)) {
    return fail(input, ctx, "MALFORMED_VOLUME", "volume");
  }

  const price = finiteOrNull(input.price);
  const lastTrade = finiteOrNull(input.lastTradePrice);
  const minuteClose = finiteOrNull(input.minuteClose);
  const dayClose = finiteOrNull(input.dayClose);
  const vwap = finiteOrNull(input.vwap);
  const priorClose = finiteOrNull(input.priorClose);

  const anyPrice =
    (price !== null && price > 0) ||
    (lastTrade !== null && lastTrade > 0) ||
    (minuteClose !== null && minuteClose > 0) ||
    (dayClose !== null && dayClose > 0);

  if (!anyPrice) {
    const anyPresent =
      input.price !== undefined && input.price !== null ||
      input.lastTradePrice !== undefined && input.lastTradePrice !== null ||
      input.minuteClose !== undefined && input.minuteClose !== null ||
      input.dayClose !== undefined && input.dayClose !== null;
    if (anyPresent) return fail(input, ctx, "NON_POSITIVE_PRICE", "price");
    return fail(input, ctx, "MISSING_QUOTE", "price");
  }

  const resolved =
    (price !== null && price > 0 ? price : null) ??
    (lastTrade !== null && lastTrade > 0 ? lastTrade : null) ??
    (minuteClose !== null && minuteClose > 0 ? minuteClose : null) ??
    (dayClose !== null && dayClose > 0 ? dayClose : null);

  if (resolved === null || !(resolved > 0)) {
    return fail(input, ctx, "NON_POSITIVE_PRICE", "price");
  }

  if (currency && !isUsdCurrency(currency)) {
    return fail(input, ctx, "CURRENCY_MISMATCH", "currency");
  }

  const contemporaneous = contemporaneousPrices(input);
  for (let i = 0; i < contemporaneous.length; i++) {
    for (let j = i + 1; j < contemporaneous.length; j++) {
      const a = contemporaneous[i];
      const b = contemporaneous[j];
      if (a.value === b.value) continue;
      if (isDecimalScalePair(a.value, b.value)) {
        return fail(input, ctx, "DECIMAL_SCALE_MISMATCH", `${a.field}/${b.field}`);
      }
    }
  }

  const adjusted = finiteOrNull(input.adjustedClose);
  const unadjusted = finiteOrNull(input.unadjustedClose);
  if (adjusted !== null && adjusted > 0 && unadjusted !== null && unadjusted > 0) {
    if (isDecimalScalePair(adjusted, unadjusted) || isSplitFactorPair(adjusted, unadjusted)) {
      const ratio = pairRatio(adjusted, unadjusted);
      if (ratio !== null && ratio >= 1.8) {
        return fail(input, ctx, "SPLIT_ADJUSTMENT_MISMATCH", "adjustedClose/unadjustedClose");
      }
    }
  }

  const priorTrusted = finiteOrNull(input.priorSnapshotPrice);
  if (priorTrusted !== null && priorTrusted > 0) {
    const ratio = pairRatio(resolved, priorTrusted);
    if (ratio !== null && ratio >= 4 && !isSplitFactorPair(resolved, priorTrusted)) {
      return fail(input, ctx, "IMPLAUSIBLE_DISCONTINUITY", "priorSnapshotPrice");
    }
    if (ratio !== null && isDecimalScalePair(resolved, priorTrusted)) {
      return fail(input, ctx, "DECIMAL_SCALE_MISMATCH", "price/priorSnapshotPrice");
    }
  }

  const changePct = finiteOrNull(input.changePct);
  const volume = finiteOrNull(input.volume);
  if (volume !== null && volume < 0) {
    return fail(input, ctx, "MALFORMED_VOLUME", "volume");
  }

  return {
    valid: true,
    rejection_reason: null,
    rejected_field: null,
    symbol,
    price: resolved,
    change_pct: changePct,
    volume: volume !== null && volume >= 0 ? volume : null,
    quote_timestamp: ts,
    currency,
    raw: rawBundle(input),
    diagnostic: {
      symbol,
      provider,
      quote_timestamp: ts,
      rejected_field: null,
      reason: null,
    },
  };
}

export function formatQuoteRejectionLog(quote: NormalizedQuote): string {
  const d = quote.diagnostic;
  return [
    "quote_rejected",
    `symbol=${d.symbol ?? "unknown"}`,
    `provider=${d.provider}`,
    `quote_timestamp=${d.quote_timestamp ?? "none"}`,
    `rejected_field=${d.rejected_field ?? "none"}`,
    `reason=${d.reason ?? "none"}`,
  ].join(" ");
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

/**
 * Extract corroborating Polygon snapshot fields from a v2 snapshot body
 * (`{ ticker: { ... } }`) or a bare ticker object.
 */
export function extractPolygonSnapshotFields(
  body: unknown,
  symbolHint?: unknown,
): RawQuoteFields | null {
  if (!isPlainObject(body)) return null;
  const tick = isPlainObject(body.ticker) ? body.ticker : body;
  const prevDay = isPlainObject(tick.prevDay) ? tick.prevDay : {};
  const day = isPlainObject(tick.day) ? tick.day : {};
  const lastTrade = isPlainObject(tick.lastTrade) ? tick.lastTrade : {};
  const min = isPlainObject(tick.min) ? tick.min : {};
  const details = isPlainObject(tick.details) ? tick.details : {};
  const symbol =
    symbolHint ??
    tick.ticker ??
    (typeof body.ticker === "string" ? body.ticker : null);
  const currency =
    details.currency_symbol ??
    details.currency_name ??
    tick.currency ??
    body.currency ??
    null;
  const ts = lastTrade.t ?? tick.updated ?? min.t ?? null;
  const price =
    (typeof lastTrade.p === "number" && lastTrade.p > 0 ? lastTrade.p : null) ??
    (typeof min.c === "number" && min.c > 0 ? min.c : null) ??
    (typeof day.c === "number" && day.c > 0 ? day.c : null);
  return {
    symbol,
    price,
    lastTradePrice: lastTrade.p,
    minuteClose: min.c,
    dayClose: day.c,
    vwap: day.vw,
    priorClose: prevDay.c,
    quoteTimestamp: ts,
    volume: day.v,
    currency,
  };
}
