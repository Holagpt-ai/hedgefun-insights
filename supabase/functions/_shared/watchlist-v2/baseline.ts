// Pure baseline construction for Watchlist V2 RVOL.
// Consumes validated Polygon 1-minute aggregate bars; produces a canonical
// 390-point cumulative-volume curve averaged across accepted RTH sessions.
// Never fabricates a bar or a price; a missing minute is treated as
// zero new reported volume (cumulative forward-fill).

// Fast ET conversion (no Intl in hot loop). Handles US DST since 2007:
// EDT (UTC-4) starts 2nd Sunday of March 07:00 UTC, ends 1st Sunday of November 06:00 UTC.
const DST_CACHE = new Map<number, { start: number; end: number }>();
function dstBoundsUtcMs(year: number) {
  let b = DST_CACHE.get(year);
  if (b) return b;
  // 2nd Sunday of March: find first Sunday, add 7 days.
  const march1 = Date.UTC(year, 2, 1);
  const marchDow = new Date(march1).getUTCDay(); // 0=Sun
  const march2ndSun = Date.UTC(year, 2, 1 + ((7 - marchDow) % 7) + 7);
  const start = march2ndSun + 7 * 3600 * 1000;
  const nov1 = Date.UTC(year, 10, 1);
  const novDow = new Date(nov1).getUTCDay();
  const nov1stSun = Date.UTC(year, 10, 1 + ((7 - novDow) % 7));
  const end = nov1stSun + 6 * 3600 * 1000;
  b = { start, end };
  DST_CACHE.set(year, b);
  return b;
}
function etDateAndMinute(tMs: number): { date: string; minutes: number } {
  const year = new Date(tMs).getUTCFullYear();
  const { start, end } = dstBoundsUtcMs(year);
  const offsetHours = tMs >= start && tMs < end ? 4 : 5;
  const etMs = tMs - offsetHours * 3600 * 1000;
  const d = new Date(etMs);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const minutes = d.getUTCHours() * 60 + d.getUTCMinutes();
  return { date: `${yyyy}-${mm}-${dd}`, minutes };
}


export interface RawBar {
  t?: unknown; o?: unknown; h?: unknown; l?: unknown; c?: unknown; v?: unknown;
}

export interface ValidBar { t: number; o: number; h: number; l: number; c: number; v: number; }

/** RTH bar window: 09:30 through 15:59 America/New_York (minutes 570..959 inclusive). */
export const RTH_START_MIN = 570;
export const RTH_END_MIN = 959;
export const CURVE_LEN = 390; // 09:30..15:59 inclusive
export const MIN_SESSIONS = 10;
export const MAX_SESSIONS = 20;
/** Reject sessions with fewer than this many populated minutes (out of 390). */
export const MIN_MINUTES_PER_SESSION = 200;

function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function validateBar(raw: RawBar): ValidBar | null {
  const { t, o, h, l, c, v } = raw;
  if (!isNum(t) || !isNum(o) || !isNum(h) || !isNum(l) || !isNum(c) || !isNum(v)) return null;
  if (v < 0) return null;
  if (h < l) return null;
  if (o <= 0 || h <= 0 || l <= 0 || c <= 0) return null;
  if (o < l || o > h) return null;
  if (c < l || c > h) return null;
  return { t, o, h, l, c, v };
}

/**
 * Group validated RTH bars by ET session date. Bars outside RTH or with
 * timestamps in the future (relative to `nowMs`) are excluded.
 */
export function groupBarsByEtDate(
  rawBars: unknown,
  nowMs: number,
): Map<string, Map<number, ValidBar>> {
  const out = new Map<string, Map<number, ValidBar>>();
  if (!Array.isArray(rawBars)) return out;
  for (const r of rawBars) {
    if (!r || typeof r !== "object") continue;
    const b = validateBar(r as RawBar);
    if (!b) continue;
    if (b.t > nowMs) continue;
    const et = etDateAndMinute(b.t);
    if (et.minutes < RTH_START_MIN || et.minutes > RTH_END_MIN) continue;
    let day = out.get(et.date);
    if (!day) { day = new Map(); out.set(et.date, day); }
    // Dedupe on minute; last write wins.
    day.set(et.minutes - RTH_START_MIN, b);
  }
  return out;
}

export interface SessionCurve {
  date: string;
  minutesPopulated: number;
  cumulative: number[]; // length CURVE_LEN
}

/**
 * Build a per-session cumulative volume vector (length 390) using forward-fill
 * for missing minutes (no fabricated bar). Returns null when the session has
 * fewer than MIN_MINUTES_PER_SESSION populated minutes.
 */
export function buildSessionCurve(
  date: string,
  minuteMap: Map<number, ValidBar>,
): SessionCurve | null {
  const populated = minuteMap.size;
  if (populated < MIN_MINUTES_PER_SESSION) return null;
  const cum = new Array<number>(CURVE_LEN);
  let running = 0;
  for (let m = 0; m < CURVE_LEN; m++) {
    const bar = minuteMap.get(m);
    if (bar) running += bar.v;
    cum[m] = running;
  }
  if (running <= 0) return null;
  return { date, minutesPopulated: populated, cumulative: cum };
}

export interface BaselineResult {
  ok: true;
  baseline_date: string;
  sessions_used: number;
  curve: Array<{ m: number; cum: number }>;
}
export interface BaselineFailure {
  ok: false;
  reason: "insufficient_sessions" | "no_valid_bars" | "curve_invalid";
  sessions_available: number;
}

/**
 * Average per-minute cumulative volume across the most recent accepted sessions.
 * Requires MIN_SESSIONS..MAX_SESSIONS accepted sessions strictly < `notAfterDate`.
 */
export function buildBaselineFromBars(
  rawBars: unknown,
  nowMs: number,
  notAfterDate: string,
): BaselineResult | BaselineFailure {
  const grouped = groupBarsByEtDate(rawBars, nowMs);
  if (grouped.size === 0) {
    return { ok: false, reason: "no_valid_bars", sessions_available: 0 };
  }
  const sessions: SessionCurve[] = [];
  for (const [date, minuteMap] of grouped) {
    if (date >= notAfterDate) continue; // never use in-progress or future sessions
    const s = buildSessionCurve(date, minuteMap);
    if (s) sessions.push(s);
  }
  sessions.sort((a, b) => a.date.localeCompare(b.date));
  const accepted = sessions.slice(-MAX_SESSIONS);
  if (accepted.length < MIN_SESSIONS) {
    return { ok: false, reason: "insufficient_sessions", sessions_available: accepted.length };
  }
  const n = accepted.length;
  const curve: Array<{ m: number; cum: number }> = new Array(CURVE_LEN);
  let lastCum = -1;
  for (let m = 0; m < CURVE_LEN; m++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += accepted[i].cumulative[m];
    const avg = sum / n;
    if (!Number.isFinite(avg) || avg < 0) {
      return { ok: false, reason: "curve_invalid", sessions_available: n };
    }
    const rounded = Math.max(lastCum, Math.round(avg));
    curve[m] = { m, cum: rounded };
    lastCum = rounded;
  }
  const last = curve[CURVE_LEN - 1].cum;
  if (last <= 0) {
    return { ok: false, reason: "curve_invalid", sessions_available: n };
  }
  return {
    ok: true,
    baseline_date: accepted[accepted.length - 1].date,
    sessions_used: n,
    curve,
  };
}
