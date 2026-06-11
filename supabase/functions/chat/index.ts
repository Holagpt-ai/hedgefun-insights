import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are HedgeFun AI, a specialized stock market assistant for HedgeFun.fun.

STRICT SCOPE RULES:
- ONLY answer questions about: stocks, ETFs, market analysis, financial metrics (P/E ratio, EPS, market cap, revenue, etc.), trading strategies, market news, IPOs, earnings, dividends, economic indicators, and investment concepts.
- NEVER discuss anything outside of financial markets and investing.
- If asked anything unrelated, respond: "I'm HedgeFun AI — I can only help with stock market and investing questions. What would you like to know about the markets?"

RESPONSE STYLE:
- Be concise, data-focused, and professional. Under 250 words unless detail is explicitly requested.
- Always include ticker symbol in parentheses e.g. Apple (AAPL).
- Format: use $, %, B for billions, M for millions.
- End every response with: "This is not financial advice — always do your own research."

CAPABILITIES: Explain financial metrics, discuss market trends, trading concepts (options, DCA, short selling), macro factors, earnings reports, IPO filings.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, sessionToken } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      throw new Error("Missing required Supabase environment variables");
    }

    // Auth check (optional - anonymous users allowed with limits)
    const authHeader = req.headers.get("Authorization");
    let user: { id: string } | null = null;
    let userPlan = "free";

    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    if (authHeader) {
      const supabase = createClient(
        supabaseUrl,
        supabaseAnonKey,
        { global: { headers: { Authorization: authHeader } } }
      );
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        user = authUser;
        const { data: profile } = await adminSupabase
          .from("profiles")
          .select("plan")
          .eq("id", authUser.id)
          .single();
        userPlan = profile?.plan ?? "free";
      }
    }

    // Memory context (PRO/admin only)
    let memoryContext = "";
    const isProOrAdmin = userPlan === "pro" || userPlan === "admin";

    if (user && isProOrAdmin) {
      try {
        const { data: memory } = await adminSupabase
          .from("ai_user_memory")
          .select("*")
          .eq("user_id", user.id)
          .maybeSingle();

        if (memory) {
          memoryContext = `\n\nKNOWN CONTEXT ABOUT THIS USER (use naturally, don't repeat back verbatim):
- Tickers of interest: ${JSON.stringify(memory.tickers_of_interest ?? [])}
- Trading style: ${JSON.stringify(memory.trading_style ?? {})}
- Risk tolerance: ${JSON.stringify(memory.risk_tolerance ?? {})}
- Goals: ${JSON.stringify(memory.goals ?? [])}
- Recurring patterns observed: ${JSON.stringify(memory.recurring_observations ?? [])}`;
        }
      } catch (e) {
        console.error("Memory read error:", e);
      }
    }



    const today = new Date().toISOString().split("T")[0];

    // Rate limiting
    if (user) {
      if (userPlan === "free") {
        const { data: todaySessions } = await adminSupabase
          .from("chatbot_sessions")
          .select("messages")
          .eq("user_id", user.id)
          .gte("last_active_at", today);

        const totalUserMessages = (todaySessions ?? []).reduce((acc: number, s: { messages: unknown }) => {
          const msgs = (s.messages as Array<{ role: string }>) ?? [];
          return acc + msgs.filter((m) => m.role === "user").length;
        }, 0);

        if (totalUserMessages >= 10) {
          return new Response(
            JSON.stringify({ error: "Daily limit reached. Upgrade to HedgeFun Pro for unlimited AI queries." }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      // Pro users: unlimited
    } else if (sessionToken) {
      // Anonymous: 3 queries per session
      const { data: anonSession } = await adminSupabase
        .from("chatbot_sessions")
        .select("messages")
        .eq("session_token", sessionToken)
        .single();

      const anonMessages = ((anonSession?.messages ?? []) as Array<{ role: string }>)
        .filter((m) => m.role === "user").length;

      if (anonMessages >= 3) {
        return new Response(
          JSON.stringify({ error: "Sign up for free to get 10 daily AI queries. No credit card required." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Call Lovable AI Gateway (Gemini)
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT + memoryContext },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI service temporarily unavailable." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For session tracking, we need to collect the full response
    // But we also want to stream to the client
    // Solution: tee the stream - one for client, one for session saving
    if (sessionToken) {
      // Collect full response for session saving while streaming
      const [clientStream, saveStream] = response.body!.tee();

      // Save session in background
      const savePromise = (async () => {
        const reader = saveStream.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          for (const line of text.split("\n")) {
            if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
            try {
              const parsed = JSON.parse(line.slice(6));
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) fullContent += content;
            } catch { /* partial JSON */ }
          }
        }

        if (fullContent) {
          await adminSupabase.from("chatbot_sessions").upsert({
            session_token: sessionToken,
            user_id: user?.id ?? null,
            messages: [...messages, { role: "assistant", content: fullContent }],
            last_active_at: new Date().toISOString(),
          }, { onConflict: "session_token" });
        }
      })();

      // Don't await - let it save in background
      savePromise.catch((e) => console.error("Session save error:", e));

      return new Response(clientStream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
