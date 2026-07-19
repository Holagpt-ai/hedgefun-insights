import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { timingSafeMatchAny } from "../_shared/timing-safe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "private, no-store",
};

type BriefType = "am" | "pm";

const AM_WINDOW_START = 6 * 60; // 360
const AM_WINDOW_END = 6 * 60 + 10; // 370 inclusive
const WINDOW_LENGTH_MIN = 10;

// Process-local best-effort cache for /v1/marketstatus/upcoming only.
const UPCOMING_TTL_MS = 15 * 60 * 1000;
let upcomingCache: { at: number; rows: UpcomingRow[] } | null = null;

interface UpcomingRow {
  exchange?: string;
  name?: string;
  status?: string;
  date?: string;
  open?: string | null;
  close?: string | null;
}

interface NowResponse {
  market?: string;
  earlyHours?: boolean;
  afterHours?: boolean;
  serverTime?: string;
  exchanges?: { nyse?: string; nasdaq?: string };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function sanitize(msg: string): string {
  return String(msg)
    .replace(/apiKey=[^&\s"']+/gi, "apiKey=***")
    .replace(/https?:\/\/api\.polygon\.io[^\s"']*/gi, "https://api.polygon.io/***");
}

function etParts(now: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
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
  return {
    date: `${year}-${month}-${day}`,
    weekday,
    hour,
    minute,
    minutes: (Number.isFinite(hour) ? hour : 0) * 60 + (Number.isFinite(minute) ? minute : 0),
  };
}

function isWeekend(weekday: string): boolean {
  return weekday === "Sat" || weekday === "Sun";
}

/** Extract "-04:00" or "-05:00" style offset from a provider serverTime string. */
function extractEtOffset(serverTime: string): string | null {
  if (typeof serverTime !== "string") return null;
  const m = serverTime.match(/([+-]\d{2}:\d{2})$/);
  if (!m) return null;
  // Only accept -04:00 (EDT) or -05:00 (EST). Anything else is suspect.
  if (m[1] !== "-04:00" && m[1] !== "-05:00") return null;
  return m[1];
}

async function fetchUpcoming(apiKey: string): Promise<UpcomingRow[]> {
  const nowMs = Date.now();
  if (upcomingCache && nowMs - upcomingCache.at <= UPCOMING_TTL_MS) {
    return upcomingCache.rows;
  }
  let res: Response;
  try {
    res = await fetch(`https://api.polygon.io/v1/marketstatus/upcoming?apiKey=${apiKey}`);
  } catch (e) {
    console.error("brief-dispatch upcoming fetch error:", sanitize((e as Error).message ?? ""));
    throw new Error("upcoming_fetch_failed");
  }
  if (!res.ok) {
    console.error("brief-dispatch upcoming non-2xx:", res.status);
    throw new Error("upcoming_non_ok");
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("upcoming_invalid_json");
  }
  if (!Array.isArray(body)) throw new Error("upcoming_malformed");
  const rows = body as UpcomingRow[];
  upcomingCache = { at: nowMs, rows };
  return rows;
}

async function fetchNow(apiKey: string): Promise<NowResponse> {
  let res: Response;
  try {
    res = await fetch(`https://api.polygon.io/v1/marketstatus/now?apiKey=${apiKey}`);
  } catch (e) {
    console.error("brief-dispatch now fetch error:", sanitize((e as Error).message ?? ""));
    throw new Error("now_fetch_failed");
  }
  if (!res.ok) throw new Error("now_non_ok");
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("now_invalid_json");
  }
  if (!body || typeof body !== "object") throw new Error("now_malformed");
  return body as NowResponse;
}

type Classification =
  | { kind: "normal" }
  | { kind: "full_holiday" }
  | { kind: "early_close"; closeIso: string }
  | { kind: "conflict" };

function classifyToday(rows: UpcomingRow[], etDate: string): Classification {
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
    if (typeof c1 !== "string" || typeof c2 !== "string" || !c1 || !c2) {
      return { kind: "conflict" };
    }
    const t1 = Date.parse(c1);
    const t2 = Date.parse(c2);
    if (!Number.isFinite(t1) || !Number.isFinite(t2) || t1 !== t2) {
      return { kind: "conflict" };
    }
    return { kind: "early_close", closeIso: c1 };
  }
  return { kind: "conflict" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // Authenticate: SYNC_SECRET only.
  const syncSecret = Deno.env.get("SYNC_SECRET") ?? "";
  const syncSecretNext = Deno.env.get("SYNC_SECRET_NEXT") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const presented = m ? m[1].trim() : "";
  const okAuth = !!presented &&
    (await timingSafeMatchAny(presented, [syncSecret, syncSecretNext]));
  if (!okAuth) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: { briefType?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const briefType = body.briefType as BriefType | undefined;
  if (briefType !== "am" && briefType !== "pm") {
    return json({ error: "Invalid briefType" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const polygonKey = Deno.env.get("POLYGON_API_KEY") ?? "";
  if (!supabaseUrl || !polygonKey) {
    console.error("brief-dispatch: server_misconfigured");
    return json({ error: "Server misconfigured" }, 500);
  }

  const et = etParts();

  if (isWeekend(et.weekday)) {
    return json({ dispatched: false, reason: "weekend" }, 200);
  }

  // AM admission: only 6:00–6:10 AM ET inclusive.
  if (briefType === "am") {
    if (et.minutes < AM_WINDOW_START || et.minutes > AM_WINDOW_END) {
      return json({ dispatched: false, reason: "outside_generation_window" }, 200);
    }
  }

  // Fetch calendar (cached).
  let upcoming: UpcomingRow[];
  try {
    upcoming = await fetchUpcoming(polygonKey);
  } catch {
    return json({ dispatched: false, reason: "calendar_unavailable" }, 503);
  }

  const classification = classifyToday(upcoming, et.date);
  if (classification.kind === "conflict") {
    return json({ dispatched: false, reason: "calendar_conflict" }, 503);
  }
  if (classification.kind === "full_holiday") {
    return json({ dispatched: false, reason: "full_holiday" }, 200);
  }

  // For PM we still need /now to determine ET offset and confirm state.
  // For AM we also need /now to confirm extended-hours state.
  let nowResp: NowResponse;
  try {
    nowResp = await fetchNow(polygonKey);
  } catch {
    return json({ dispatched: false, reason: "calendar_unavailable" }, 503);
  }

  const etOffset = extractEtOffset(nowResp.serverTime ?? "");
  if (!etOffset) {
    return json({ dispatched: false, reason: "calendar_unavailable" }, 503);
  }

  // Build market schedule (needed for PM window; AM does not gate on schedule but we still
  // pass a schedule reflecting today's close for provenance downstream on PM only).
  let officialCloseIso: string;
  let scheduleStatus: "normal" | "early-close";
  if (classification.kind === "early_close") {
    officialCloseIso = classification.closeIso;
    scheduleStatus = "early-close";
  } else {
    // Normal 4:00 PM ET close using offset from provider serverTime.
    officialCloseIso = `${et.date}T16:00:00${etOffset}`;
    scheduleStatus = "normal";
  }
  const closeMs = Date.parse(officialCloseIso);
  if (!Number.isFinite(closeMs)) {
    return json({ dispatched: false, reason: "calendar_unavailable" }, 503);
  }
  const releaseMs = closeMs + 15 * 60 * 1000;
  const releaseIso = new Date(releaseMs).toISOString();
  // Confirm close/release fall on the ET brief date.
  const closeEtDate = etParts(new Date(closeMs)).date;
  const releaseEtDate = etParts(new Date(releaseMs)).date;
  if (closeEtDate !== et.date || releaseEtDate !== et.date) {
    return json({ dispatched: false, reason: "calendar_conflict" }, 503);
  }
  const calendarCheckedAt = new Date().toISOString();
  const marketSchedule = {
    status: scheduleStatus,
    official_close_at: new Date(closeMs).toISOString(),
    release_at: releaseIso,
    source: "polygon_marketstatus" as const,
    calendar_checked_at: calendarCheckedAt,
  };

  // PM window check
  if (briefType === "pm") {
    const nowMs = Date.now();
    const upperMs = releaseMs + WINDOW_LENGTH_MIN * 60 * 1000;
    if (nowMs < releaseMs || nowMs > upperMs) {
      return json({ dispatched: false, reason: "outside_generation_window" }, 200);
    }
  }

  // /now state confirmation
  const nyseNow = nowResp.exchanges?.nyse;
  const nasdaqNow = nowResp.exchanges?.nasdaq;
  const marketNow = nowResp.market;
  const okExt =
    marketNow === "extended-hours" &&
    nyseNow === "extended-hours" &&
    nasdaqNow === "extended-hours";
  if (briefType === "am") {
    if (!okExt || nowResp.earlyHours !== true) {
      return json({ dispatched: false, reason: "market_status_unconfirmed" }, 503);
    }
  } else {
    if (!okExt || nowResp.afterHours !== true) {
      return json({ dispatched: false, reason: "market_status_unconfirmed" }, 503);
    }
  }

  // Call generator server-to-server.
  const generatorUrl = `${supabaseUrl}/functions/v1/generate-daily-brief`;
  let genRes: Response;
  try {
    genRes = await fetch(generatorUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${syncSecret}`,
      },
      body: JSON.stringify({ briefType, marketSchedule }),
    });
  } catch (e) {
    console.error("brief-dispatch generator fetch error:", sanitize((e as Error).message ?? ""));
    return json({ error: "generator_unavailable" }, 502);
  }

  let genBody: any = null;
  try {
    genBody = await genRes.json();
  } catch {
    return json({ error: "invalid_generator_response" }, 502);
  }

  if (genRes.status === 401) {
    return json({ error: "internal_authentication_failure" }, 500);
  }
  if (genRes.status === 400) {
    return json({ error: "invalid_internal_schedule" }, 500);
  }
  if (genRes.status === 502) {
    return json({ error: "generation_provider_failure" }, 502);
  }
  if (genRes.status === 503) {
    return json({ error: "generation_source_unavailable" }, 503);
  }
  if (!genRes.ok) {
    return json({ error: "invalid_generator_response" }, 502);
  }

  // Success: validate response contract.
  const availableFalse = genBody && genBody.available === false;
  if (availableFalse) {
    // Weekend/source-unavailable etc: propagate as calendar-conflict style failure.
    return json({ error: "invalid_generator_response" }, 502);
  }
  const bd = genBody?.brief_date;
  const bt = genBody?.brief_type;
  if (bt !== briefType || typeof bd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(bd)) {
    return json({ error: "invalid_generator_response" }, 502);
  }

  return json(
    {
      dispatched: true,
      brief_type: briefType,
      brief_date: bd,
      cached: Boolean(genBody.cached),
    },
    200,
  );
});
