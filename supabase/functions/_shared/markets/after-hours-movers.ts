/**
 * Full-market after-hours mover classification.
 * Uses independently paired lastTrade/min observations. Never todaysChangePerc.
 */

import {
  type CalendarExceptionRow,
  easternParts,
  isWithinAfterHoursWindow,
  type ResolvedSessionSchedule,
  resolveScheduleAt,
} from "./session-schedule.ts";

export const AH_ROW_LIMIT = 20;
export const AH_EMPTY_GRACE_MS = 5 * 60_000;
export const AH_TIE_BREAK = "lastTrade" as const;
export const SYMBOL_RE = /^[A-Z][A-Z0-9.\-]*$/;
export const SYMBOL_MAX_LEN = 12;

export type AhSide = "gainer" | "loser";
export type AhObservationSource = "lastTrade" | "min";

export type AhTicker = {
  ticker?: unknown;
  symbol?: unknown;
  name?: unknown;
  details?: { name?: unknown };
  todaysChangePerc?: unknown;
  day?: { c?: unknown; v?: unknown };
  lastTrade?: { p?: unknown; t?: unknown };
  min?: { c?: unknown; t?: unknown; v?: unknown; av?: unknown };
  [key: string]: unknown;
};

export type AhObservation = {
  price: number;
  ms: number;
  source: AhObservationSource;
};

export type AhClassifiedRow = {
  side: AhSide;
  rank: number;
  symbol: string;
  company_name: string | null;
  extended_last: number;
  regular_close: number;
  change_percent: number;
  change_amount: number;
  volume: number | null;
  observation_source: AhObservationSource;
  observation_ms: number;
  provider_as_of: string;
};

export type AhPublishDecision =
  | {
    action: "replace";
    sessionDate: string;
    status: "available" | "empty";
    rows: AhClassifiedRow[];
    providerAsOfMin: string | null;
    providerAsOfMax: string | null;
  }
  | { action: "retain"; reason: string };

function finitePositive(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !(n > 0)) return null;
  return n;
}

function finiteNumber(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeSymbol(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const symbol = raw.trim().toUpperCase();
  if (!symbol || symbol.length > SYMBOL_MAX_LEN) return null;
  if (!SYMBOL_RE.test(symbol)) return null;
  return symbol;
}

export function providerTimestampMs(raw: unknown): number | null {
  const n = finiteNumber(raw);
  if (n === null || !(n > 0)) return null;
  let ms: number;
  if (n >= 1e17 && n < 1e20) ms = Math.trunc(n / 1_000_000);
  else if (n >= 1e14 && n < 1e17) ms = Math.trunc(n / 1_000);
  else if (n >= 1e11 && n < 1e14) ms = Math.trunc(n);
  else if (n >= 1e9 && n < 1e10) ms = Math.trunc(n * 1_000);
  else return null;
  if (!Number.isFinite(ms) || !(ms > 0)) return null;
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year < 2000 || year > 2100) {
    return null;
  }
  return ms;
}

export function isAfterHoursObservation(
  tsRaw: unknown,
  schedule: ResolvedSessionSchedule,
): boolean {
  const ms = providerTimestampMs(tsRaw);
  if (ms === null) return false;
  const parts = easternParts(ms);
  if (!parts) return false;
  if (parts.date !== schedule.sessionDate) return false;
  return isWithinAfterHoursWindow(parts.msOfDay, schedule);
}

function pairedObservation(
  priceRaw: unknown,
  tsRaw: unknown,
  source: AhObservationSource,
  schedule: ResolvedSessionSchedule,
): AhObservation | null {
  const price = finitePositive(priceRaw);
  if (price === null) return null;
  if (!isAfterHoursObservation(tsRaw, schedule)) return null;
  const ms = providerTimestampMs(tsRaw);
  if (ms === null) return null;
  return { price, ms, source };
}

export function selectNewestAfterHoursObservation(
  t: AhTicker,
  schedule: ResolvedSessionSchedule,
): AhObservation | null {
  const last = pairedObservation(
    t?.lastTrade?.p,
    t?.lastTrade?.t,
    "lastTrade",
    schedule,
  );
  const min = pairedObservation(t?.min?.c, t?.min?.t, "min", schedule);
  const candidates = [last, min].filter((c): c is AhObservation => c !== null);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.ms !== a.ms) return b.ms - a.ms;
    if (a.source === AH_TIE_BREAK && b.source !== AH_TIE_BREAK) return -1;
    if (b.source === AH_TIE_BREAK && a.source !== AH_TIE_BREAK) return 1;
    return 0;
  });
  return candidates[0] ?? null;
}

function regularClose(t: AhTicker): number | null {
  return finitePositive(t?.day?.c);
}

function volumeOf(t: AhTicker): number | null {
  const dayV = finiteNumber(t?.day?.v);
  if (dayV !== null && dayV > 0) return dayV;
  const av = finiteNumber(t?.min?.av);
  if (av !== null && av > 0) return av;
  const minV = finiteNumber(t?.min?.v);
  if (minV !== null && minV > 0) return minV;
  return null;
}

export function classifyTicker(
  t: AhTicker,
  schedule: ResolvedSessionSchedule,
): Omit<AhClassifiedRow, "side" | "rank"> | null {
  const symbol = normalizeSymbol(t?.ticker) ?? normalizeSymbol(t?.symbol);
  if (!symbol) return null;
  const close = regularClose(t);
  if (close === null) return null;
  const obs = selectNewestAfterHoursObservation(t, schedule);
  if (!obs) return null;
  const pct = ((obs.price - close) / close) * 100;
  if (!Number.isFinite(pct) || pct === 0) return null;
  return {
    symbol,
    company_name: null,
    extended_last: obs.price,
    regular_close: close,
    change_percent: pct,
    change_amount: obs.price - close,
    volume: volumeOf(t),
    observation_source: obs.source,
    observation_ms: obs.ms,
    provider_as_of: new Date(obs.ms).toISOString(),
  };
}

function keepBetter(
  prev: Omit<AhClassifiedRow, "side" | "rank">,
  next: Omit<AhClassifiedRow, "side" | "rank">,
): Omit<AhClassifiedRow, "side" | "rank"> {
  if (next.observation_ms !== prev.observation_ms) {
    return next.observation_ms > prev.observation_ms ? next : prev;
  }
  if (
    next.observation_source === AH_TIE_BREAK &&
    prev.observation_source !== AH_TIE_BREAK
  ) {
    return next;
  }
  return prev;
}

function rankSection(
  rows: Array<Omit<AhClassifiedRow, "side" | "rank">>,
  side: AhSide,
): AhClassifiedRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (side === "gainer") {
      if (b.change_percent !== a.change_percent) {
        return b.change_percent - a.change_percent;
      }
    } else if (a.change_percent !== b.change_percent) {
      return a.change_percent - b.change_percent;
    }
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
  });
  return sorted.slice(0, AH_ROW_LIMIT).map((row, index) => ({
    ...row,
    side,
    rank: index + 1,
  }));
}

export function classifyFullMarketAfterHours(
  universe: AhTicker[],
  schedule: ResolvedSessionSchedule,
): AhClassifiedRow[] {
  const bySymbol = new Map<string, Omit<AhClassifiedRow, "side" | "rank">>();
  for (const t of universe) {
    const row = classifyTicker(t, schedule);
    if (!row) continue;
    const prev = bySymbol.get(row.symbol);
    bySymbol.set(row.symbol, prev ? keepBetter(prev, row) : row);
  }
  const all = [...bySymbol.values()];
  const gainers = rankSection(
    all.filter((r) => r.change_percent > 0),
    "gainer",
  );
  const losers = rankSection(
    all.filter((r) => r.change_percent < 0),
    "loser",
  );
  return [...gainers, ...losers];
}

export function applyNames(
  rows: AhClassifiedRow[],
  names: ReadonlyMap<string, string>,
): AhClassifiedRow[] {
  return rows.map((row) => {
    const name = names.get(row.symbol);
    return {
      ...row,
      company_name: name && name.trim() !== "" ? name.trim() : null,
    };
  });
}

export function decideAfterHoursPublish(opts: {
  nowMs: number;
  exceptions: CalendarExceptionRow[] | null;
  classified: AhClassifiedRow[];
  providerFailed: boolean;
}): AhPublishDecision {
  if (opts.providerFailed) {
    return { action: "retain", reason: "provider_unavailable" };
  }
  const schedule = resolveScheduleAt(opts.nowMs, opts.exceptions);
  if (!schedule) return { action: "retain", reason: "schedule_unresolved" };
  if (schedule.marketStatus === "closed") {
    return { action: "retain", reason: "session_closed" };
  }
  const parts = easternParts(opts.nowMs);
  if (!parts) return { action: "retain", reason: "clock_unresolved" };
  if (parts.date !== schedule.sessionDate) {
    return { action: "retain", reason: "session_mismatch" };
  }
  if (!isWithinAfterHoursWindow(parts.msOfDay, schedule)) {
    return { action: "retain", reason: "outside_after_hours_window" };
  }

  const bounds = providerBounds(opts.classified);
  if (opts.classified.length > 0) {
    return {
      action: "replace",
      sessionDate: schedule.sessionDate,
      status: "available",
      rows: opts.classified,
      providerAsOfMin: bounds.min,
      providerAsOfMax: bounds.max,
    };
  }

  const elapsed = parts.msOfDay - schedule.regularCloseMsOfDay;
  if (elapsed < AH_EMPTY_GRACE_MS) {
    return { action: "retain", reason: "empty_grace" };
  }
  return {
    action: "replace",
    sessionDate: schedule.sessionDate,
    status: "empty",
    rows: [],
    providerAsOfMin: null,
    providerAsOfMax: null,
  };
}

function providerBounds(
  rows: AhClassifiedRow[],
): { min: string | null; max: string | null } {
  if (rows.length === 0) return { min: null, max: null };
  let min = rows[0].provider_as_of;
  let max = rows[0].provider_as_of;
  for (const row of rows) {
    if (row.provider_as_of < min) min = row.provider_as_of;
    if (row.provider_as_of > max) max = row.provider_as_of;
  }
  return { min, max };
}
