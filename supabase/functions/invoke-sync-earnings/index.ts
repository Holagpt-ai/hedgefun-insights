import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async () => {
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-earnings`;
  const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${srk}`, "Content-Type": "application/json" },
  });
  const text = await res.text();
  console.log("sync-earnings status:", res.status);
  console.log("sync-earnings body:", text);
  return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
});
