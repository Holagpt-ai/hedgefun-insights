// W2-R1 temporary canonical-secret promotion bridge. DELETE AFTER USE.
// Authenticates with rotation NEXT, then moves Edge SYNC_SECRET into the
// canonical Vault sync_secret row through a parameterized RPC.
// No secret is logged, returned, or interpolated into SQL.

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

  // Authenticate using rotation NEXT only.
  const rotationNext = Deno.env.get("SYNC_SECRET_NEXT") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const presented = match ? match[1].trim() : "";

  const authorized =
    !!presented &&
    (await timingSafeMatch(presented, rotationNext));

  if (!authorized) {
    return json({ error: "unauthorized" }, 401);
  }

  // Read the newly replaced canonical Edge secret internally.
  const canonical = Deno.env.get("SYNC_SECRET") ?? "";
  if (canonical.length < 24) {
    return json({ ok: false, code: "canonical_not_configured" }, 500);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.rpc(
    "w2r1_promote_vault_canonical",
    { p_secret: canonical },
  );

  if (error) {
    const message = error.message ?? "";
    const code = message.includes("invalid_secret")
      ? "invalid_secret"
      : message.includes("canonical_row_invalid")
      ? "canonical_row_invalid"
      : message.includes("next_row_invalid")
      ? "next_row_invalid"
      : "rpc_failed";

    return json({ ok: false, code }, 409);
  }

  return json({ ok: data === true }, data === true ? 200 : 500);
});
