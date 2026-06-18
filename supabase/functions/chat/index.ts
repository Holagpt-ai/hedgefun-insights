import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are HedgeFun AI, an elite stock market analyst and trading assistant for HedgeFun.fun. You have deep expertise in technical analysis, momentum trading, and market structure.

STRICT SCOPE RULES:
- ONLY answer questions about: stocks, ETFs, options, market analysis, financial metrics (P/E, EPS, market cap, revenue, RVOL, float, short interest), trading strategies, market news, IPOs, earnings, dividends, economic indicators, and investment concepts.
- NEVER discuss anything outside of financial markets and investing.
- If asked anything unrelated, respond: "I'm HedgeFun AI — I can only help with stock market and investing questions. What would you like to know about the markets?"

TRADING EXPERTISE:
- You are familiar with momentum and day trading setups including: Flat Top Breakout, Bottom Bouncer, Flat Base Breakout, and Breakout/Pullback to Support.
- When discussing price action, reference these setups where relevant.
- You understand RVOL, float rotation, short squeezes, gap-and-go patterns.

RESPONSE STYLE:
- Be concise, data-focused, and professional. Under 300 words unless detail is explicitly requested.
- Always include ticker symbol in parentheses e.g. Apple (AAPL).
- Format numbers: use $, %, B for billions, M for millions.
- Structure longer responses with clear sections.
- End every response with: "⚠️ Not financial advice — always do your own research."

CAPABILITIES: Technical analysis, financial metrics, market trends, trading concepts, macro factors, earnings analysis, IPO filings, sector rotation, risk management.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, sessionToken, model, systemContext, attachment } = await req.json();

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
        const { count: turnsToday } = await adminSupabase
          .from("ai_daily_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("entry_type", "ai_turn")
          .gte("created_at", today);

        if ((turnsToday ?? 0) >= 5) {
          return new Response(
            JSON.stringify({ error: "daily_limit_reached" }),
            { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
      // pro / admin / unlimited: unlimited
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
          JSON.stringify({ error: "Sign up for free to get more daily AI queries. No credit card required." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Model enforcement
    const requestedModel: string = model ?? "claude-haiku-4-5-20251001";
    let resolvedModel: string;
    if (userPlan === "unlimited" || userPlan === "admin") {
      if (requestedModel === "claude-opus-4-6") {
        const { count: opusCount } = await adminSupabase
          .from("ai_daily_logs")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user!.id)
          .eq("entry_type", "ai_turn")
          .eq("payload->>model", "claude-opus-4-6")
          .gte("created_at", today);
        resolvedModel = (opusCount ?? 0) >= 20 ? "claude-sonnet-4-6" : "claude-opus-4-6";
      } else {
        resolvedModel = requestedModel;
      }
    } else if (userPlan === "pro") {
      resolvedModel = requestedModel === "claude-opus-4-6" ? "claude-sonnet-4-6" : requestedModel;
    } else {
      resolvedModel = "claude-haiku-4-5-20251001";
    }

    // Call Anthropic Claude API
    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not configured");

    // Build messages with optional attachment on the last user message
    const builtMessages = messages.map((m: { role: string; content: unknown }) => ({ ...m }));
    if (attachment && builtMessages.length > 0) {
      const lastIdx = builtMessages.length - 1;
      const last = builtMessages[lastIdx];
      if (last.role === "user") {
        const textContent = typeof last.content === "string" ? last.content : "";
        if (attachment.type === "image") {
          last.content = [
            { type: "image", source: { type: "base64", media_type: attachment.mediaType, data: attachment.data } },
            { type: "text", text: textContent },
          ];
        } else if (attachment.type === "pdf") {
          last.content = [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: attachment.data } },
            { type: "text", text: textContent },
          ];
        }
      }
    }

    const baseSystem = SYSTEM_PROMPT + memoryContext;
    const systemPrompt = systemContext ? baseSystem + "\n\n" + systemContext : baseSystem;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: resolvedModel,
        max_tokens: 1024,
        system: systemPrompt,
        messages: builtMessages,
        stream: true,
      }),
    });

    if (!anthropicResponse.ok) {
      if (anthropicResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await anthropicResponse.text();
      console.error("Anthropic API error:", anthropicResponse.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert Anthropic SSE format to OpenAI-compatible format for src/lib/chat.ts
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      const reader = anthropicResponse.body!.getReader();
      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          for (const line of text.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === "[DONE]") {
              await writer.write(encoder.encode("data: [DONE]\n\n"));
              break;
            }
            try {
              const parsed = JSON.parse(jsonStr);
              // Anthropic streams content_block_delta events
              if (parsed.type === "content_block_delta" && parsed.delta?.text) {
                const openAIChunk = {
                  choices: [{ delta: { content: parsed.delta.text } }],
                };
                await writer.write(
                  encoder.encode(`data: ${JSON.stringify(openAIChunk)}\n\n`)
                );
              }
              // Forward stream_end as [DONE]
              if (parsed.type === "message_stop") {
                await writer.write(encoder.encode("data: [DONE]\n\n"));
              }
            } catch { /* partial JSON, skip */ }
          }
        }
      } finally {
        writer.close();
      }
    })();

    const response = readable;

    // For session tracking, we need to collect the full response
    // But we also want to stream to the client
    // Solution: tee the stream - one for client, one for session saving
    if (sessionToken) {
      // Collect full response for session saving while streaming
      const [clientStream, saveStream] = response.tee();

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

          // Log ai_turn for authenticated users (used for rate limiting & opus quotas)
          if (user) {
            await adminSupabase.from("ai_daily_logs").insert({
              user_id: user.id,
              entry_type: "ai_turn",
              payload: { model: resolvedModel, plan: userPlan },
            });
          }

          // PRO/admin: persistent memory + daily logs + Claude Haiku extraction
          if (user && isProOrAdmin) {
            try {
              // 3a. Upsert conversation session
              await adminSupabase.from("ai_conversation_sessions").upsert({
                user_id: user.id,
                session_token: sessionToken,
                last_active_at: new Date().toISOString(),
              }, { onConflict: "session_token" });

              await adminSupabase
                .rpc("increment_session_message_count", { p_session_token: sessionToken })
                .then(() => {}, () => {});

              // 3b. Log raw event
              const lastUserMessage = messages[messages.length - 1]?.content ?? "";
              await adminSupabase.from("ai_daily_logs").insert({
                user_id: user.id,
                entry_type: "chat_message",
                payload: {
                  user_message: lastUserMessage,
                  assistant_response: fullContent,
                  session_token: sessionToken,
                },
              });

              // 3c. Extract memory via Claude Haiku (fire-and-forget)
              if (ANTHROPIC_API_KEY) {
                (async () => {
                  try {
                    const extractionPrompt = `You are a memory-extraction system for a trading app. Given this exchange, extract any NEW facts about the user's trading interests, style, risk tolerance, or goals. Respond ONLY with a JSON object (no markdown, no preamble) with these optional keys: tickers_of_interest (array of strings), trading_style (object), risk_tolerance (object), goals (array of strings). If nothing new was learned, respond with {}.

User message: ${lastUserMessage}
Assistant response: ${fullContent}`;

                    const haikuRes = await fetch("https://api.anthropic.com/v1/messages", {
                      method: "POST",
                      headers: {
                        "x-api-key": ANTHROPIC_API_KEY,
                        "anthropic-version": "2023-06-01",
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        model: "claude-haiku-4-5-20251001",
                        max_tokens: 500,
                        messages: [{ role: "user", content: extractionPrompt }],
                      }),
                    });

                    if (!haikuRes.ok) return;

                    const haikuData = await haikuRes.json();
                    const textBlock = haikuData.content?.find((b: { type: string }) => b.type === "text");
                    if (!textBlock?.text) return;

                    const cleaned = textBlock.text.replace(/```json|```/g, "").trim();
                    const extracted = JSON.parse(cleaned);

                    if (Object.keys(extracted).length === 0) return;

                    const { data: existing } = await adminSupabase
                      .from("ai_user_memory")
                      .select("*")
                      .eq("user_id", user.id)
                      .maybeSingle();

                    const mergedTickers = Array.from(new Set([
                      ...(existing?.tickers_of_interest ?? []),
                      ...(extracted.tickers_of_interest ?? []),
                    ]));

                    const mergedGoals = Array.from(new Set([
                      ...(existing?.goals ?? []),
                      ...(extracted.goals ?? []),
                    ]));

                    await adminSupabase.from("ai_user_memory").upsert({
                      user_id: user.id,
                      tickers_of_interest: mergedTickers,
                      trading_style: { ...(existing?.trading_style ?? {}), ...(extracted.trading_style ?? {}) },
                      risk_tolerance: { ...(existing?.risk_tolerance ?? {}), ...(extracted.risk_tolerance ?? {}) },
                      goals: mergedGoals,
                      updated_at: new Date().toISOString(),
                    }, { onConflict: "user_id" });
                  } catch (e) {
                    console.error("Memory extraction error:", e);
                  }
                })();
              }
            } catch (e) {
              console.error("PRO memory/log error:", e);
            }
          }
        }

      })();

      // Don't await - let it save in background
      savePromise.catch((e) => console.error("Session save error:", e));

      return new Response(clientStream, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    return new Response(response, {
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
