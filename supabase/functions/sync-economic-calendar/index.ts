/**
 * Economic calendar sync stub — production deploy requires Lovable Cloud authorization.
 *
 * Provider research (verify subscription before enable):
 * - Massive/Polygon: evaluate Benzinga/economic calendar endpoints on the active Stocksist entitlement.
 * - Finnhub: `calendar/economic` (separate API key; confirm US high-impact coverage).
 *
 * Required secret: POLYGON_API_KEY or FINNHUB_API_KEY (per chosen adapter).
 * Expected volume: ~1 request/day range sync + on-demand month windows (<<1000 req/mo).
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }
  return Response.json(
    {
      ok: false,
      status: "not_activated",
      message:
        "sync-economic-calendar is prepared in Git only. Activate in Lovable Cloud after provider entitlement is confirmed.",
    },
    { status: 501 },
  );
});