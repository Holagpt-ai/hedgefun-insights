// Session resolution for Watchlist V2. Fail-closed: any calendar ambiguity yields
// SESSION_UNRESOLVED — never falls back to a normal session.
// Pure/injectable: accepts `now` and marketstatus fetcher for headless testing.

import type { SessionType } from "./contract.ts";
import { sanitize } from "./sanitize.ts";

export interface EtParts {
  date: string;      // YYYY-MM-DD (ET)
  weekday: string;   // "Mon" ... "Sun"
  hour: number;
  minute: number;
  minutes: number;   // hour*60 + minute
}

export function etParts(now: Date): EtParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric", month: "2-digit", day: "2-digit",
    weekday: "short", hour: "2-digit", minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const weekday = get("weekday");
  const hour = parseInt(get("hour"), 10);
  const minute = parseInt(get("minute"), 10);
  const h = Number.isFinite(hour) ? hour : 0;
  const m = Number.isFinite(minute) ? minute : 0;
  return {
    date: `${year}-${month}-${day}`,
    weekday, hour: h, minute: m,
    minutes: h * 60 + m,
  };
}

export function isWeekend(weekday: string): boolean {
  return weekday === "Sat" || weekday === "Sun";
}

export function extractEtOffset(serverTime: unknown): string | null {
  if (typeof serverTime !== "string") return null;
  const m = serverTime.match(/([+-]\d{2}:\d{2})$/);
  if (!m) return null;
  if (m[1] !== "-04:00" && m[1] !== "-05:00") return null;
  return m[1];
}

export interface UpcomingRow {
  exchange?: string;
  status?: string;
  date?: string;
  open?: string | null;
  close?: string | null;
}

export interface NowResponse {
  serverTime?: string;
}

export type Classification =
  | { kind: "normal" }
  | { kind: "full_holiday" }
  | { kind: "early_close"; closeIso: string }
  | { kind: "conflict" };

export function classifyToday(rows: UpcomingRow[], etDate: string): Classification {
  const todayRows = rows.filter(
    (r) => r.date === etDate && (r.exchange === "NYSE" || r.exchange === "NASDAQ"),
  );
  const nyse = todayRows.find((r) => r.exchange === "NYSE");
  const nasdaq = todayRows.find((r) => r.exchange === "NASDAQ");
  if (!nyse && !nasdaq) return { kind: "normal" };
  if (!nyse || !nasdaq) return { kind: "conflict" };
  if (nyse.status !== nasdaq.status) return { kind: "conflict" };
  const status = nyse.status;
  if (status === "closed") return { kind: "full_holiday" };
  if (status === "early-close") {
    const c1 = nyse.close, c2 = nasdaq.close;
    if (typeof c1 !== "string" || typeof c2 !== "string" || !c1 || !c2) return { kind: "conflict" };
    const t1 = Date.parse(c1);
    const t2 = Date.parse(c2);
    if (!Number.isFinite(t1) || !Number.isFinite(t2) || t1 !== t2) return { kind: "conflict" };
    return { kind: "early_close", closeIso: c1 };
  }
  return { kind: "conflict" };
}

export type SessionResolution =
  | {
      ok: true;
      session_type: SessionType;
      session_date: string;
      et_now_minutes: number;
      early_close_minutes: number | null;
    }
  | { ok: false; reason: "NON_TRADING_DAY" | "OUTSIDE_SESSION_WINDOW" | "SESSION_UNRESOLVED" };

export interface MarketStatusFetcher {
  fetchNow(): Promise<NowResponse>;
  fetchUpcoming(): Promise<UpcomingRow[]>;
}

/**
 * Resolve current trading session.
 * @param now - Injected "current instant" for testability.
 * @param fetcher - Injected market-status source (Polygon /v1/marketstatus/*).
 */
export async function resolveSession(
  now: Date,
  fetcher: MarketStatusFetcher,
): Promise<SessionResolution> {
  const et = etParts(now);

  if (isWeekend(et.weekday)) {
    return { ok: false, reason: "NON_TRADING_DAY" };
  }

  // Window check first — pure ET, no network needed.
  const mins = et.minutes;
  if (mins < 4 * 60 || mins > 19 * 60 + 59) {
    return { ok: false, reason: "OUTSIDE_SESSION_WINDOW" };
  }

  let now_body: NowResponse;
  let upcoming: UpcomingRow[];
  try {
    now_body = await fetcher.fetchNow();
    upcoming = await fetcher.fetchUpcoming();
  } catch (e) {
    console.warn("[wl-v2] session marketstatus fetch failed:", sanitize(e));
    return { ok: false, reason: "SESSION_UNRESOLVED" };
  }

  const offset = extractEtOffset(now_body?.serverTime);
  if (!offset) return { ok: false, reason: "SESSION_UNRESOLVED" };

  const cls = classifyToday(upcoming, et.date);
  if (cls.kind === "conflict") return { ok: false, reason: "SESSION_UNRESOLVED" };
  if (cls.kind === "full_holiday") return { ok: false, reason: "NON_TRADING_DAY" };

  let earlyCloseMinutes: number | null = null;
  if (cls.kind === "early_close") {
    const closeMs = Date.parse(cls.closeIso);
    if (!Number.isFinite(closeMs)) return { ok: false, reason: "SESSION_UNRESOLVED" };
    const closeEt = etParts(new Date(closeMs));
    if (closeEt.date !== et.date) return { ok: false, reason: "SESSION_UNRESOLVED" };
    earlyCloseMinutes = closeEt.minutes;
  }

  let session_type: SessionType;
  if (mins < 570) {
    session_type = "premarket";
  } else if (earlyCloseMinutes !== null && mins >= earlyCloseMinutes) {
    session_type = "postclose";
  } else if (mins < 960) {
    session_type = "rth";
  } else {
    session_type = "postclose";
  }

  return {
    ok: true,
    session_type,
    session_date: et.date,
    et_now_minutes: mins,
    early_close_minutes: earlyCloseMinutes,
  };
}
