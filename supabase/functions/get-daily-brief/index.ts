import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

const PRO_PLANS = new Set(["pro", "unlimited", "admin"]);
const PM_RELEASE_MIN = 975; // 16*60 + 15 = 4:15 PM ET


type BriefType = "am" | "pm";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function unavailable(briefType: BriefType, reason: string): Response {
  return json({ available: false, brief_type: briefType, reason }, 200);
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

function daysBetweenIsoDates(a: string, b: string): number {
  // a and b are YYYY-MM-DD ET calendar dates; compute integer day delta a-b.
  const [ay, am, ad] = a.split("-").map((x) => parseInt(x, 10));
  const [by, bm, bd] = b.split("-").map((x) => parseInt(x, 10));
  const au = Date.UTC(ay, am - 1, ad);
  const bu = Date.UTC(by, bm - 1, bd);
  return Math.round((au - bu) / 86400000);
}

function isValidIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function isValidTimestamp(s: unknown): boolean {
  if (typeof s !== "string" || !s) return false;
  const t = Date.parse(s);
  return Number.isFinite(t);
}

interface BriefRow {
  id: string;
  brief_type: string;
  brief_date: string;
  content: string;
  generated_at: string;
  market_snapshot: unknown;
}

function validateProvenance(row: BriefRow, expectedType: BriefType): { ok: true; sourceCheckedAt: string } | { ok: false } {
  if (row.brief_type !== expectedType) return { ok: false };
  if (!isValidIsoDate(row.brief_date)) return { ok: false };
  if (!isValidTimestamp(row.generated_at)) return { ok: false };
  if (typeof row.content !== "string" || row.content.trim().length === 0) return { ok: false };
  const snap = row.market_snapshot;
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return { ok: false };
  const s = snap as Record<string, unknown>;
  if (s.source !== "market_indexes") return { ok: false };
  if (!isValidTimestamp(s.source_checked_at)) return { ok: false };
  return { ok: true, sourceCheckedAt: s.source_checked_at as string };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error("get-daily-brief: server_misconfigured");
      return json({ error: "Server misconfigured" }, 500);
    }

    // Parse body
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

    // Auth header
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader || !/^Bearer\s+.+/i.test(authHeader)) {
      return json({ error: "Unauthorized" }, 401);
    }

    // Verify user via anon client with forwarded Authorization
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user?.id) {
      return json({ error: "Unauthorized" }, 401);
    }
    const userId = userData.user.id;

    // Admin client for entitlement + brief lookup
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("plan")
      .eq("id", userId)
      .maybeSingle();

    if (profileErr || !profile) {
      return json({ error: "Pro access required" }, 403);
    }
    const plan = String(profile.plan ?? "").trim().toLowerCase();
    if (!PRO_PLANS.has(plan)) {
      return json({ error: "Pro access required" }, 403);
    }

    // ET context
    const et = etParts();

    // AM branch
    if (briefType === "am") {
      if (isWeekend(et.weekday)) {
        return unavailable("am", "weekend_no_am_brief");
      }
      const { data: row } = await admin
        .from("daily_briefs")
        .select("id, brief_type, brief_date, content, generated_at, market_snapshot")
        .eq("brief_type", "am")
        .eq("brief_date", et.date)
        .maybeSingle();
      if (!row) return unavailable("am", "brief_not_ready");
      const v = validateProvenance(row as BriefRow, "am");
      if (!v.ok) return unavailable("am", "invalid_brief_provenance");
      return json(
        {
          available: true,
          brief_type: "am",
          brief_date: row.brief_date,
          generated_at: row.generated_at,
          content: row.content,
          previous_trading_day: false,
          source_checked_at: v.sourceCheckedAt,
        },
        200,
      );
    }

    // PM branch
    if (isWeekend(et.weekday)) {
      // Weekend V1: require the immediately preceding Friday's PM brief.
      // Saturday -> minus 1 calendar day; Sunday -> minus 2 calendar days.
      // If Friday was a market holiday, delivery fails closed.
      // Holiday-aware fallback is deferred until an authoritative trading
      // calendar is implemented; no older reports are considered.
      const offset = et.weekday === "Sat" ? 1 : 2;
      const [ey, em, ed] = et.date.split("-").map((x) => parseInt(x, 10));
      const friUtc = new Date(Date.UTC(ey, em - 1, ed - offset));
      const fy = friUtc.getUTCFullYear();
      const fm = String(friUtc.getUTCMonth() + 1).padStart(2, "0");
      const fd = String(friUtc.getUTCDate()).padStart(2, "0");
      const expectedFriday = `${fy}-${fm}-${fd}`;

      const { data: row } = await admin
        .from("daily_briefs")
        .select("id, brief_type, brief_date, content, generated_at, market_snapshot")
        .eq("brief_type", "pm")
        .eq("brief_date", expectedFriday)
        .maybeSingle();
      if (!row) return unavailable("pm", "previous_report_unavailable");
      const v = validateProvenance(row as BriefRow, "pm");
      if (!v.ok) return unavailable("pm", "invalid_brief_provenance");
      return json(
        {
          available: true,
          brief_type: "pm",
          brief_date: row.brief_date,
          generated_at: row.generated_at,
          content: row.content,
          previous_trading_day: true,
          source_checked_at: v.sourceCheckedAt,
        },
        200,
      );
    }


    // Weekday PM
    if (et.minutes < PM_RELEASE_MIN) {
      return unavailable("pm", "pm_not_released");
    }

    const { data: row } = await admin
      .from("daily_briefs")
      .select("id, brief_type, brief_date, content, generated_at, market_snapshot")
      .eq("brief_type", "pm")
      .eq("brief_date", et.date)
      .maybeSingle();
    if (!row) return unavailable("pm", "brief_not_ready");
    const v = validateProvenance(row as BriefRow, "pm");
    if (!v.ok) return unavailable("pm", "invalid_brief_provenance");
    return json(
      {
        available: true,
        brief_type: "pm",
        brief_date: row.brief_date,
        generated_at: row.generated_at,
        content: row.content,
        previous_trading_day: false,
        source_checked_at: v.sourceCheckedAt,
      },
      200,
    );
  } catch (e) {
    console.error("get-daily-brief: internal_error", (e as Error)?.name ?? "unknown");
    return json({ error: "Internal error" }, 500);
  }
});
