import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { timingSafeMatchAny } from "../_shared/timing-safe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SENTIMENT_TIERS = ["Bearish", "Neutral", "Bullish", "Very Bullish"];

function sentimentTierIndex(s: string): number {
  return SENTIMENT_TIERS.indexOf(s);
}

function isSignificantChange(
  newScore: number,
  prevScore: number | null,
  newSentiment: string,
  prevSentiment: string | null
): boolean {
  if (prevScore === null) return false;
  const delta = Math.abs(newScore - prevScore);
  const sentimentChanged = prevSentiment !== null && newSentiment !== prevSentiment;
  return delta >= 5 || sentimentChanged;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth via SYNC_SECRET or valid Supabase user JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    const syncSecret = Deno.env.get("SYNC_SECRET");
    const syncSecretNext = Deno.env.get("SYNC_SECRET_NEXT");

    let authorized = false;

    // Check SYNC_SECRET (canonical or rotation NEXT) first — constant-time
    if (await timingSafeMatchAny(token, [syncSecret, syncSecretNext])) {
      authorized = true;
    }

    // Fall back to validating user JWT
    if (!authorized) {
      try {
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
        const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
        const authCheck = await fetch(`${supabaseUrl}/auth/v1/user`, {
          headers: {
            "Authorization": `Bearer ${token}`,
            "apikey": anonKey,
          },
        });
        if (authCheck.ok) authorized = true;
      } catch { /* fall through */ }
    }

    if (!authorized) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();

    let body: any = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      body = {};
    }
    const rawTicker = body.ticker ?? body.record?.symbol;
    const ticker = typeof rawTicker === "string" ? rawTicker.trim().toUpperCase() : null;
    if (!ticker) {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const polygonKey = Deno.env.get("POLYGON_API_KEY");
    const finnhubKey = Deno.env.get("FINNHUB_API_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    // ── 1. Fetch signals in parallel ──────────────────────────────────────

    const [snapshotRes, newsRes, financialsRes, earningsRes] = await Promise.allSettled([
      fetch(
        `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${polygonKey}`,
        { signal: AbortSignal.timeout(8000) }
      ),
      fetch(
        `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${new Date(Date.now() - 86400000).toISOString().split("T")[0]}&to=${new Date().toISOString().split("T")[0]}&token=${finnhubKey}`,
        { signal: AbortSignal.timeout(8000) }
      ),
      fetch(
        `https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${finnhubKey}`,
        { signal: AbortSignal.timeout(8000) }
      ),
      supabase
        .from("earnings_calendar")
        .select("report_date, time_of_day, estimate_eps")
        .eq("symbol", ticker)
        .gte("report_date", new Date().toISOString().split("T")[0])
        .order("report_date", { ascending: true })
        .limit(1),
    ]);

    // ── 2. Parse signals ──────────────────────────────────────────────────

    let snapshot: Record<string, unknown> = {};
    if (snapshotRes.status === "fulfilled" && snapshotRes.value.ok) {
      const j = await snapshotRes.value.json();
      snapshot = j?.ticker ?? {};
    }

    let newsHeadlines: string[] = [];
    if (newsRes.status === "fulfilled" && newsRes.value.ok) {
      const articles = await newsRes.value.json();
      if (Array.isArray(articles)) {
        newsHeadlines = articles.slice(0, 5).map((a: Record<string, unknown>) => String(a.headline ?? ""));
      }
    }

    let rsi: number | null = null;
    if (financialsRes.status === "fulfilled" && financialsRes.value.ok) {
      const fin = await financialsRes.value.json();
      rsi = fin?.metric?.rsi14 ?? null;
    }

    let upcomingEarnings: string | null = null;
    if (earningsRes.status === "fulfilled" && !earningsRes.value.error && earningsRes.value.data?.length) {
      upcomingEarnings = earningsRes.value.data[0].report_date;
    }

    const day = (snapshot as Record<string, Record<string, number>>).day ?? {};
    const prevDay = (snapshot as Record<string, Record<string, number>>).prevDay ?? {};
    const price = day.c ?? prevDay.c ?? null;
    const changePct = (snapshot as Record<string, number>).todaysChangePerc ?? null;
    const volume = day.v ?? null;
    const avgVolume = prevDay.v ?? null;
    const rvol = volume && avgVolume && avgVolume > 0 ? +(volume / avgVolume).toFixed(2) : null;
    const lastTrade = (snapshot as Record<string, Record<string, number>>).lastTrade ?? {};
    const optionsSnapshot = (snapshot as Record<string, unknown>).options ?? null;

    // ── 3. Read previous analysis ─────────────────────────────────────────

    const { data: prev } = await supabase
      .from("watchlist_ai_analysis")
      .select("hf_score, sentiment, confidence, summary, analyzed_at")
      .eq("ticker", ticker)
      .single();

    // ── 4. Build prompt ───────────────────────────────────────────────────

    const signalBlock = [
      `TICKER: ${ticker}`,
      price !== null ? `PRICE: $${price} | CHANGE: ${changePct !== null ? changePct.toFixed(2) + "%" : "N/A"}` : "PRICE: unavailable",
      rvol !== null ? `RVOL: ${rvol}x` : "RVOL: unavailable",
      rsi !== null ? `RSI(14): ${rsi}` : "RSI: unavailable",
      newsHeadlines.length ? `NEWS (last 24h):\n${newsHeadlines.map((h) => `- ${h}`).join("\n")}` : "NEWS: none",
      upcomingEarnings ? `UPCOMING EARNINGS: ${upcomingEarnings}` : "UPCOMING EARNINGS: none in calendar",
      prev ? `PREVIOUS SCORE: ${prev.hf_score} | PREVIOUS SENTIMENT: ${prev.sentiment} | PREVIOUS ANALYSIS: ${prev.analyzed_at}` : "PREVIOUS ANALYSIS: none (first analysis)",
    ].join("\n");

    const prompt = `You are HedgeFun AI, an institutional-grade stock analyst. Analyze the following signals and return a JSON object only — no prose, no markdown, no explanation outside the JSON.

${signalBlock}

Return exactly this JSON shape:
{
  "hf_score": <integer 0-100>,
  "confidence": <integer 0-100>,
  "sentiment": <"Bearish" | "Neutral" | "Bullish" | "Very Bullish">,
  "summary": <one sentence, max 25 words, explaining the current thesis>,
  "reasoning": [<3-5 short bullet strings, each citing a specific signal>],
  "smart_tags": [<2-5 classification tags, e.g. "AI Infrastructure", "Low Float", "Earnings Soon", "Momentum">]
}

Rules:
- hf_score 0-30 = Bearish, 31-50 = Neutral, 51-74 = Bullish, 75-100 = Very Bullish. Score and sentiment must be consistent.
- Every reasoning bullet must cite a specific signal (price, RVOL, RSI, news headline, or catalyst). Never output a bare sentiment label.
- If signals are insufficient, return hf_score 50, confidence 30, sentiment Neutral, summary "Insufficient data for high-confidence analysis.", reasoning ["Limited signal data available"], smart_tags [].
- Return JSON only. No other text.`;

    // ── 5. Call Haiku ─────────────────────────────────────────────────────

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 512,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!aiRes.ok) {
      throw new Error(`Anthropic error: ${aiRes.status}`);
    }

    const aiJson = await aiRes.json();
    const rawText = aiJson?.content?.[0]?.text ?? "";

    let analysis: {
      hf_score: number;
      confidence: number;
      sentiment: string;
      summary: string;
      reasoning: string[];
      smart_tags: string[];
    };

    try {
      analysis = JSON.parse(rawText.replace(/```json|```/g, "").trim());
    } catch {
      throw new Error(`AI returned unparseable response: ${rawText.slice(0, 200)}`);
    }

    // ── 6. Validate AI output ─────────────────────────────────────────────

    const validSentiments = ["Bearish", "Neutral", "Bullish", "Very Bullish"];
    if (
      typeof analysis.hf_score !== "number" ||
      !validSentiments.includes(analysis.sentiment) ||
      !Array.isArray(analysis.reasoning)
    ) {
      throw new Error(`AI output failed validation: ${JSON.stringify(analysis)}`);
    }

    // ── 7. Detect significant change → write alert ────────────────────────

    const significant = isSignificantChange(
      analysis.hf_score,
      prev?.hf_score ?? null,
      analysis.sentiment,
      prev?.sentiment ?? null
    );

    if (significant && prev) {
      const alertType =
        prev.sentiment !== analysis.sentiment ? "sentiment_change" : "score_change";

      await supabase.from("watchlist_ai_alerts").insert({
        ticker,
        alert_type: alertType,
        score_from: prev.hf_score,
        score_to: analysis.hf_score,
        sentiment_from: prev.sentiment,
        sentiment_to: analysis.sentiment,
        confidence: analysis.confidence,
        reason: analysis.summary,
        reasoning: analysis.reasoning,
      });
    }

    // ── 8. Upsert analysis ────────────────────────────────────────────────

    const signals = {
      price,
      change_pct: changePct,
      rvol,
      rsi,
      news_headlines: newsHeadlines,
      upcoming_earnings: upcomingEarnings,
      last_trade: lastTrade,
    };

    const { error: upsertError } = await supabase
      .from("watchlist_ai_analysis")
      .upsert({
        ticker,
        hf_score: analysis.hf_score,
        hf_score_prev: prev?.hf_score ?? null,
        sentiment: analysis.sentiment,
        sentiment_prev: prev?.sentiment ?? null,
        confidence: analysis.confidence,
        summary: analysis.summary,
        reasoning: analysis.reasoning,
        smart_tags: analysis.smart_tags,
        signals,
        analyzed_at: new Date().toISOString(),
        prev_analyzed_at: prev?.analyzed_at ?? null,
      });

    if (upsertError) throw new Error(`Upsert failed: ${upsertError.message}`);

    // ── 9. Return result ──────────────────────────────────────────────────

    return new Response(
      JSON.stringify({
        ticker,
        hf_score: analysis.hf_score,
        sentiment: analysis.sentiment,
        confidence: analysis.confidence,
        summary: analysis.summary,
        reasoning: analysis.reasoning,
        smart_tags: analysis.smart_tags,
        alert_generated: significant && !!prev,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[analyze-watchlist-tickers] error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
