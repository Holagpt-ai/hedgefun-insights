const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/sync-earnings`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${Deno.env.get("SYNC_SECRET")}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const text = await res.text();
  console.log("sync-earnings status:", res.status);
  console.log("sync-earnings body:", text);
  return new Response(text, { status: res.status, headers: corsHeaders });
});
