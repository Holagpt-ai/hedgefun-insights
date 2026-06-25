import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Restrict to server-side/cron callers only.
    // Accept either the service-role key or SYNC_SECRET as a bearer token.
    const authHeader = req.headers.get("Authorization") ?? "";
    const presented = authHeader.replace(/^Bearer\s+/i, "").trim();
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const syncSecret = Deno.env.get("SYNC_SECRET") ?? "";
    if (!presented || (presented !== serviceRoleKey && (!syncSecret || presented !== syncSecret))) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { briefType } = await req.json(); // "am" | "pm"
    if (!briefType || !["am", "pm"].includes(briefType)) {
      return new Response(JSON.stringify({ error: "Invalid briefType" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anthropicApiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !anthropicApiKey) {
      throw new Error("Missing environment variables");
    }

    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
    const today = new Date().toISOString().split("T")[0];

    const { data: existingBrief } = await adminSupabase
      .from("daily_briefs")
      .select("*")
      .eq("brief_type", briefType)
      .eq("brief_date", today)
      .maybeSingle();

    if (existingBrief) {
      return new Response(
        JSON.stringify({ id: existingBrief.id, content: existingBrief.content, cached: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: indexes } = await adminSupabase
      .from("market_indexes")
      .select("symbol, current_value, change_percent")
      .limit(12);

    const marketSnapshot = (indexes ?? []).reduce(
      (acc: Record<string, { value: number; change: number }>, idx: any) => {
        acc[idx.symbol] = { value: idx.current_value, change: idx.change_percent };
        return acc;
      },
      {}
    );

    const marketContext = Object.entries(marketSnapshot)
      .map(([sym, data]) => `${sym}: ${data.value} (${data.change > 0 ? "+" : ""}${data.change}%)`)
      .join(", ");

    const systemPrompt =
      briefType === "am"
        ? "You are a market analyst writing a brief for active traders before market open. Write 3-4 sentences covering key overnight developments, earnings, economic data, and catalysts for the day. Reference specific tickers. Style: professional, concise, actionable. No preamble."
        : "You are a market analyst writing a brief after market close. Write 3-4 sentences covering today's market action, key moves, upcoming events, and setup for tomorrow. Reference specific tickers. Style: professional, concise, forward-looking. No preamble.";

    const userPrompt = `Market snapshot: ${marketContext}. Write a ${
      briefType === "am" ? "morning" : "evening"
    } market brief.`;

    const haikuRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: userPrompt }],
        system: systemPrompt,
      }),
    });

    if (!haikuRes.ok) {
      const err = await haikuRes.text();
      console.error("Haiku error:", haikuRes.status, err);
      throw new Error(`Claude API error: ${haikuRes.status}`);
    }

    const haikuData = await haikuRes.json();
    const textBlock = haikuData.content?.find((b: { type: string }) => b.type === "text");
    const briefContent = textBlock?.text || "";

    if (!briefContent) throw new Error("No content from Claude");

    const { data: savedBrief, error: saveError } = await adminSupabase
      .from("daily_briefs")
      .insert({
        brief_type: briefType,
        brief_date: today,
        content: briefContent,
        market_snapshot: marketSnapshot,
        generated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (saveError) throw saveError;

    return new Response(
      JSON.stringify({ id: savedBrief.id, content: briefContent, cached: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("generate-daily-brief error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
