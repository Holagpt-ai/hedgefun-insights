import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hmacToken(email: string): Promise<string> {
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email.trim().toLowerCase()));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const rawEmail = body?.email;
    const source = typeof body?.source === "string" ? body.source : "unknown";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!rawEmail || typeof rawEmail !== "string" || !emailRegex.test(rawEmail.trim())) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const email = rawEmail.trim().toLowerCase();

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing API key" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Server-side subscribe: only send the welcome email when this is a brand-new
    // subscription. Duplicates short-circuit so this endpoint cannot be used to
    // repeatedly spam an existing address with welcome emails.
    const { error: insertError } = await supabase
      .from("newsletter_subscribers")
      .insert({ email, source });

    if (insertError) {
      if (insertError.code === "23505") {
        return new Response(JSON.stringify({ status: "duplicate" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("Subscribe insert error:", insertError);
      return new Response(JSON.stringify({ error: "Subscribe failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = await hmacToken(email);
    const unsubscribeUrl = `https://hedgefun.fun/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;

    const welcomeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f8fafc;">
<div style="max-width:560px;margin:40px auto;font-family:Arial,sans-serif;">
  <div style="background:#0f172a;padding:24px 32px;border-radius:8px 8px 0 0;">
    <span style="font-size:20px;font-weight:700;color:#fff;">HedgeFun<span style="color:#1d4ed8;">.</span></span>
  </div>
  <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:0;">
    <h1 style="margin:0 0 16px;font-size:22px;color:#0f172a;">You're in. Welcome to Market Bullets.</h1>
    <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">Every weekday morning, before the market opens, we'll send you a free 2-minute brief that cuts through the noise.</p>
    <p style="margin:0 0 12px;font-size:13px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;">What you'll get</p>
    <p style="margin:0 0 8px;font-size:15px;color:#334155;"><span style="color:#1d4ed8;font-weight:700;">→</span> A quick snapshot of the major market indexes</p>
    <p style="margin:0 0 8px;font-size:15px;color:#334155;"><span style="color:#1d4ed8;font-weight:700;">→</span> The top market-moving stories, in bullet points</p>
    <p style="margin:0 0 8px;font-size:15px;color:#334155;"><span style="color:#1d4ed8;font-weight:700;">→</span> Key earnings reports and IPOs to watch</p>
    <p style="margin:0 0 28px;font-size:15px;color:#334155;"><span style="color:#1d4ed8;font-weight:700;">→</span> Only high-quality sources — zero clickbait</p>
    <a href="https://hedgefun.fun" style="display:inline-block;background:#1d4ed8;color:#fff;font-size:15px;font-weight:600;padding:12px 28px;border-radius:6px;text-decoration:none;">Open HedgeFun →</a>
  </div>
  <div style="padding:16px 32px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 8px 8px;background:#f8fafc;">
    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">You're receiving this because you subscribed at hedgefun.fun.<br>© 2026 HedgeFun.fun · <a href="${unsubscribeUrl}" style="color:#94a3b8;">Unsubscribe</a></p>
  </div>
</div>
</body>
</html>`;

    const adminHtml = `<p>📬 New subscriber joined</p><p>Email: ${email}</p><p>Subscribed at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} ET</p>`;

    const welcomeRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "HedgeFun <newsletter@send.hedgefun.fun>",
        to: [email],
        subject: "You're in — HedgeFun Market Bullets starts tomorrow 📈",
        html: welcomeHtml,
        text: `Welcome to HedgeFun Market Bullets!\n\nUnsubscribe: ${unsubscribeUrl}`,
      }),
    });

    if (!welcomeRes.ok) {
      const err = await welcomeRes.text();
      console.error("Welcome email error:", err);
      return new Response(JSON.stringify({ error: "Welcome email failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "HedgeFun <newsletter@send.hedgefun.fun>",
        to: ["akacarlosacosta@gmail.com"],
        subject: `📬 New subscriber: ${email}`,
        html: adminHtml,
      }),
    }).catch((err) => console.error("Admin notification error:", err));

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    console.error("Function error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
