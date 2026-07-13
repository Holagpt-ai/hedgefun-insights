import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REQUIRED_SYMBOLS = ["SPY", "QQQ", "DIA", "IWM"] as const;
const FRESHNESS_MS = 10 * 60 * 1000; // 10 minutes

type BriefType = "am" | "pm";

interface SymbolRow {
  symbol: string;
  current_value: number;
  change_percent: number;
  updated_at: string;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Deterministic ET calendar date (YYYY-MM-DD) via Intl parts. */
function etDateParts(now: Date = new Date()): {
  date: string;
  weekday: string;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  });
  const parts = fmt.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const weekday = get("weekday"); // e.g. "Mon", "Sat", "Sun"
  return { date: `${year}-${month}-${day}`, weekday };
}

function isWeekend(weekday: string): boolean {
  return weekday === "Sat" || weekday === "Sun";
}

function sanitizeProviderError(msg: string): string {
  return String(msg).replace(/[A-Za-z0-9_\-]{20,}/g, "***");
}

const SHARED_GROUNDING = `
STRICT GROUNDING RULES — the ONLY data you have is a snapshot of four broad US equity ETF proxies:
- SPY (large-cap S&P 500)
- QQQ (large-cap Nasdaq 100)
- DIA (Dow 30)
- IWM (small-cap Russell 2000)

You have percent change and current value for each. Nothing else.

You MUST NOT reference or invent any of the following, because they are not in the data:
- Earnings, guidance, or company results
- News headlines, press releases, or announcements
- Catalysts, product events, or corporate actions
- Economic data, Fed events, macro releases, or geopolitical events
- Overnight developments, futures moves, or pre-open/after-hours events beyond the snapshot
- Causal explanations for moves ("because of…", "driven by…", "on the back of…")
- Individual stocks, sectors by name, or single-name commentary
- Predictions stated as facts, price targets, or forecasts
- Watchlist personalization or any user-specific claim

If the four-index snapshot is insufficient to support a conclusion, say so explicitly and stop.
Do not fabricate. Do not speculate. Stay strictly within the four-ETF percent-change picture.
`.trim();

const AM_SYSTEM = `You are a market analyst writing a pre-open brief for active traders.
${SHARED_GROUNDING}

Allowed scope for the AM brief:
- Broad directional bias implied by the four ETF proxies
- Relative strength among SPY, QQQ, DIA, IWM
- Whether leadership appears concentrated (e.g. mega-cap tilt) or broad (small-caps participating)
- Which of the four proxies are strongest and weakest

Style: professional, concise, 3–4 sentences, no preamble. Reference the tickers by symbol. Never invent facts.`;

const PM_SYSTEM = `You are a market analyst writing a post-close recap for active traders.
${SHARED_GROUNDING}

Allowed scope for the PM brief:
- Broad session direction implied by the four ETF proxies
- Relative index performance among SPY, QQQ, DIA, IWM
- Large-cap vs small-cap participation (SPY/QQQ/DIA vs IWM)
- Strongest and weakest of the four proxies

Style: professional, concise, 3–4 sentences, no preamble. Reference the tickers by symbol. Never invent facts.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // 1. Server-only auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const presented = authHeader.replace(/^Bearer\s+/i, "").trim();
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const syncSecret = Deno.env.get("SYNC_SECRET") ?? "";
    const okAuth =
      !!presented &&
      ((serviceRoleKey && presented === serviceRoleKey) ||
        (syncSecret && presented === syncSecret));
    if (!okAuth) {
      return json({ error: "Unauthorized" }, 401);
    }

    let payload: { briefType?: string; marketSchedule?: unknown } = {};
    try {
      payload = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    const briefType = payload.briefType as BriefType | undefined;
    if (!briefType || (briefType !== "am" && briefType !== "pm")) {
      return json({ error: "Invalid briefType" }, 400);
    }

    // Optional marketSchedule metadata (from dispatcher). Validate strictly if supplied.
    let validatedSchedule:
      | {
          status: "normal" | "early-close";
          official_close_at: string;
          release_at: string;
          source: "polygon_marketstatus";
          calendar_checked_at: string;
        }
      | null = null;
    if (payload.marketSchedule !== undefined && payload.marketSchedule !== null) {
      const ms = payload.marketSchedule;
      if (!ms || typeof ms !== "object" || Array.isArray(ms)) {
        return json({ error: "Invalid marketSchedule" }, 400);
      }
      const s = ms as Record<string, unknown>;
      const status = s.status;
      const closeAt = s.official_close_at;
      const releaseAt = s.release_at;
      const src = s.source;
      const cca = s.calendar_checked_at;
      if (status !== "normal" && status !== "early-close") {
        return json({ error: "Invalid marketSchedule" }, 400);
      }
      if (src !== "polygon_marketstatus") {
        return json({ error: "Invalid marketSchedule" }, 400);
      }
      if (typeof closeAt !== "string" || typeof releaseAt !== "string" || typeof cca !== "string") {
        return json({ error: "Invalid marketSchedule" }, 400);
      }
      const closeMs = Date.parse(closeAt);
      const releaseMs = Date.parse(releaseAt);
      const ccaMs = Date.parse(cca);
      if (!Number.isFinite(closeMs) || !Number.isFinite(releaseMs) || !Number.isFinite(ccaMs)) {
        return json({ error: "Invalid marketSchedule" }, 400);
      }
      if (releaseMs - closeMs !== 15 * 60 * 1000) {
        return json({ error: "Invalid marketSchedule" }, 400);
      }
      validatedSchedule = {
        status,
        official_close_at: new Date(closeMs).toISOString(),
        release_at: new Date(releaseMs).toISOString(),
        source: "polygon_marketstatus",
        calendar_checked_at: new Date(ccaMs).toISOString(),
      };
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!supabaseUrl || !supabaseServiceKey || !anthropicApiKey) {
      return json({ error: "Server misconfigured" }, 500);
    }

    // 3. Trading-day guard (ET)
    const { date: etDate, weekday } = etDateParts();
    if (isWeekend(weekday)) {
      return json(
        {
          available: false,
          reason: "weekend_no_trading_day",
          brief_type: briefType,
          brief_date: etDate,
        },
        200,
      );
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    // 7. Cache lookup on ET date
    const { data: existingBrief } = await admin
      .from("daily_briefs")
      .select("id, brief_type, brief_date, content, market_snapshot, generated_at")
      .eq("brief_type", briefType)
      .eq("brief_date", etDate)
      .maybeSingle();

    if (existingBrief) {
      const snap = (existingBrief.market_snapshot ?? {}) as {
        source_checked_at?: string;
      };
      return json(
        {
          id: existingBrief.id,
          brief_type: existingBrief.brief_type,
          brief_date: existingBrief.brief_date,
          generated_at: existingBrief.generated_at,
          content: existingBrief.content,
          cached: true,
          source_checked_at: snap.source_checked_at ?? existingBrief.generated_at,
        },
        200,
      );
    }

    // 2. Restricted source universe with freshness gate
    const sourceCheckedAt = new Date();
    const { data: idxRows, error: idxErr } = await admin
      .from("market_indexes")
      .select("symbol, current_value, change_percent, updated_at")
      .in("symbol", REQUIRED_SYMBOLS as unknown as string[]);

    if (idxErr) {
      console.error("market_indexes fetch failed:", idxErr.message);
      return json(
        { available: false, reason: "source_unavailable", brief_type: briefType, brief_date: etDate },
        503,
      );
    }

    const bySymbol = new Map<string, SymbolRow>();
    for (const r of (idxRows ?? []) as SymbolRow[]) {
      bySymbol.set(r.symbol, r);
    }

    const nowMs = sourceCheckedAt.getTime();
    for (const sym of REQUIRED_SYMBOLS) {
      const row = bySymbol.get(sym);
      if (!row) {
        return json(
          { available: false, reason: "source_missing_symbol", brief_type: briefType, brief_date: etDate },
          503,
        );
      }
      const cv = Number(row.current_value);
      const cp = Number(row.change_percent);
      if (!Number.isFinite(cv) || cv <= 0) {
        return json(
          { available: false, reason: "source_invalid_price", brief_type: briefType, brief_date: etDate },
          503,
        );
      }
      if (!Number.isFinite(cp)) {
        return json(
          { available: false, reason: "source_invalid_change", brief_type: briefType, brief_date: etDate },
          503,
        );
      }
      if (!row.updated_at) {
        return json(
          { available: false, reason: "source_missing_updated_at", brief_type: briefType, brief_date: etDate },
          503,
        );
      }
      const ageMs = nowMs - new Date(row.updated_at).getTime();
      if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > FRESHNESS_MS) {
        return json(
          { available: false, reason: "source_stale", brief_type: briefType, brief_date: etDate },
          503,
        );
      }
    }

    // Build snapshot for prompt and provenance
    const symbolsSnap: Record<string, { current_value: number; change_percent: number; updated_at: string }> = {};
    for (const sym of REQUIRED_SYMBOLS) {
      const r = bySymbol.get(sym)!;
      symbolsSnap[sym] = {
        current_value: Number(r.current_value),
        change_percent: Number(r.change_percent),
        updated_at: r.updated_at,
      };
    }

    const marketContext = REQUIRED_SYMBOLS
      .map((s) => {
        const r = symbolsSnap[s];
        const sign = r.change_percent > 0 ? "+" : "";
        return `${s} ${r.current_value.toFixed(2)} (${sign}${r.change_percent.toFixed(2)}%)`;
      })
      .join(", ");

    const systemPrompt = briefType === "am" ? AM_SYSTEM : PM_SYSTEM;
    const userPrompt =
      `Four-ETF snapshot (${briefType === "am" ? "pre-open" : "post-close"}): ${marketContext}. ` +
      `Write a strictly grounded ${briefType === "am" ? "AM" : "PM"} brief using ONLY this data.`;

    // 6. Provider call with validated response
    let providerRes: Response;
    try {
      providerRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicApiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 350,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });
    } catch (e) {
      console.error("provider fetch failed:", sanitizeProviderError((e as Error).message ?? ""));
      return json({ error: "Upstream generation failed" }, 502);
    }

    if (!providerRes.ok) {
      console.error("provider non-2xx:", providerRes.status);
      return json({ error: "Upstream generation failed" }, 502);
    }

    let providerJson: any;
    try {
      providerJson = await providerRes.json();
    } catch {
      return json({ error: "Upstream generation failed" }, 502);
    }

    const textBlock = providerJson?.content?.find?.((b: { type: string }) => b?.type === "text");
    const briefContent = typeof textBlock?.text === "string" ? textBlock.text.trim() : "";
    if (!briefContent) {
      return json({ error: "Upstream generation failed" }, 502);
    }

    // 8. Provenance
    const marketSnapshot: Record<string, unknown> = {
      symbols: symbolsSnap,
      source: "market_indexes",
      source_checked_at: sourceCheckedAt.toISOString(),
    };
    if (validatedSchedule) {
      // Confirm schedule date corresponds to generator ET date.
      const closeEtDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(validatedSchedule.official_close_at));
      if (closeEtDate !== etDate) {
        return json({ error: "Invalid marketSchedule" }, 400);
      }
      marketSnapshot.market_schedule = validatedSchedule;
    }

    // 7. Concurrency-safe insert; on unique conflict, read the canonical row.
    const generatedAt = new Date().toISOString();
    const { data: inserted, error: insertErr } = await admin
      .from("daily_briefs")
      .insert({
        brief_type: briefType,
        brief_date: etDate,
        content: briefContent,
        market_snapshot: marketSnapshot,
        generated_at: generatedAt,
      })
      .select("id, brief_type, brief_date, content, market_snapshot, generated_at")
      .single();

    if (insertErr) {
      // Unique-violation → another invocation won the race. Return canonical row.
      const isUniqueConflict =
        (insertErr as { code?: string }).code === "23505" ||
        /duplicate key|unique constraint/i.test(insertErr.message ?? "");
      if (isUniqueConflict) {
        const { data: canonical } = await admin
          .from("daily_briefs")
          .select("id, brief_type, brief_date, content, market_snapshot, generated_at")
          .eq("brief_type", briefType)
          .eq("brief_date", etDate)
          .maybeSingle();
        if (canonical) {
          const snap = (canonical.market_snapshot ?? {}) as { source_checked_at?: string };
          return json(
            {
              id: canonical.id,
              brief_type: canonical.brief_type,
              brief_date: canonical.brief_date,
              generated_at: canonical.generated_at,
              content: canonical.content,
              cached: true,
              source_checked_at: snap.source_checked_at ?? canonical.generated_at,
            },
            200,
          );
        }
      }
      console.error("insert failed:", insertErr.message);
      return json({ error: "Persist failed" }, 500);
    }

    return json(
      {
        id: inserted.id,
        brief_type: inserted.brief_type,
        brief_date: inserted.brief_date,
        generated_at: inserted.generated_at,
        content: inserted.content,
        cached: false,
        source_checked_at: marketSnapshot.source_checked_at,
      },
      200,
    );
  } catch (e) {
    console.error("generate-daily-brief error:", sanitizeProviderError((e as Error)?.message ?? "unknown"));
    return json({ error: "Internal error" }, 500);
  }
});
