// W2-R1-1C temporary Vault-staging bridge. DELETE AFTER USE.
// Moves SYNC_SECRET_NEXT from Edge env into Vault via a parameterized RPC.
// Inbound auth: canonical SYNC_SECRET only (constant-time). NEXT is never
// accepted inbound, never logged, and never included in any response.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { timingSafeMatch } from "../_shared/timing-safe.ts";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  // Inbound auth — canonical SYNC_SECRET only.
  const canonical = Deno.env.get("SYNC_SECRET") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  const presented = m ? m[1].trim() : "";
  const okAuth = !!presented && (await timingSafeMatch(presented, canonical));
  if (!okAuth) {
    return json({ error: "unauthorized" }, 401);
  }

  // NEXT read internally only. Rejected if absent; value never logged.
  const next = Deno.env.get("SYNC_SECRET_NEXT") ?? "";
  if (!next) {
    return json({ ok: false, code: "next_not_configured" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Parameterized RPC argument — never interpolated into SQL text.
  const { data, error } = await supabase.rpc("w2r1_stage_sync_secret_next", {
    p_secret: next,
  });

  if (error) {
    const msg = error.message ?? "";
    // Map to fixed sanitized codes only; no raw DB error details returned.
    const code = msg.includes("next_row_exists")
      ? "next_row_exists"
      : msg.includes("invalid_secret")
      ? "invalid_secret"
      : "rpc_failed";
    return json({ ok: false, code }, 409);
  }

  return json({ ok: data === true }, data === true ? 200 : 500);
});
