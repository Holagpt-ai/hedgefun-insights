/**
 * Load verified previous_close / prior_session_volume from the current Radar V2 generation.
 * Used to enrich Polygon snapshot tickers when prevDay.c is absent during extended sessions.
 */

import type { VerifiedPreviousCloseOverlay } from "./normalized-market-snapshot.ts";

const OVERLAY_PAGE = 1000;

export type RadarOverlayDbClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        limit: (n: number) => PromiseLike<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
        range: (from: number, to: number) => PromiseLike<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
      };
    };
  };
};

function positiveNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Fail closed to empty overlay on any read error. */
export async function loadRadarPreviousCloseOverlay(
  sb: RadarOverlayDbClient,
): Promise<Map<string, VerifiedPreviousCloseOverlay>> {
  const out = new Map<string, VerifiedPreviousCloseOverlay>();
  try {
    const feedRes = await sb
      .from("radar_v22_feed_state")
      .select("v2_generation_id")
      .eq("state_key", "current")
      .limit(1);
    if (feedRes.error || !feedRes.data?.length) return out;
    const generationId = feedRes.data[0].v2_generation_id;
    if (typeof generationId !== "string" || !generationId) return out;

    let from = 0;
    while (true) {
      const page = await sb
        .from("radar_v22_candidates")
        .select("symbol,previous_close,prior_session_volume")
        .eq("generation_id", generationId)
        .range(from, from + OVERLAY_PAGE - 1);
      if (page.error || !page.data) return out;
      for (const row of page.data) {
        const symbol = typeof row.symbol === "string"
          ? row.symbol.trim().toUpperCase()
          : null;
        const previousClose = positiveNumber(row.previous_close);
        if (!symbol || previousClose === null) continue;
        out.set(symbol, {
          symbol,
          previousClose,
          priorSessionVolume: positiveNumber(row.prior_session_volume),
          source: "radar_v22_candidate",
        });
      }
      if (page.data.length < OVERLAY_PAGE) break;
      from += OVERLAY_PAGE;
    }
  } catch {
    return out;
  }
  return out;
}
