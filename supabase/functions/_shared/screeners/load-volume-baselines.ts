/**
 * Load published RVOL 20D baselines for the current 52W generation pointer.
 * Service-role reads only — table is not exposed to authenticated clients.
 */

import {
  parseVolumeBaselineRow,
  type VolumeBaselineQuote,
} from "./volume-baseline.ts";

const BASELINE_PAGE = 1000;

export type VolumeBaselineDbClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        limit: (n: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
        range: (from: number, to: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: { message: string } | null }>;
      };
    };
  };
};

/** Fail closed to an empty map on any query error or unavailable generation. */
export async function loadVolumeBaselines(
  sb: VolumeBaselineDbClient,
): Promise<Map<string, VolumeBaselineQuote>> {
  const out = new Map<string, VolumeBaselineQuote>();
  try {
    const stateRes = await sb
      .from("screener_52w_baseline_state")
      .select("current_generation_id,status")
      .eq("state_key", "current")
      .limit(1);
    if (stateRes.error || !stateRes.data?.length) return out;
    const generationId = stateRes.data[0].current_generation_id;
    const status = stateRes.data[0].status;
    if (status !== "available" || typeof generationId !== "string" || !generationId) {
      return out;
    }

    let from = 0;
    while (true) {
      const page = await sb
        .from("screener_volume_baselines")
        .select(
          "symbol,avg_volume_20d,volume_sessions_used,window_start_date,window_end_date",
        )
        .eq("generation_id", generationId)
        .range(from, from + BASELINE_PAGE - 1);
      if (page.error || !page.data) return out;
      for (const item of page.data) {
        const parsed = parseVolumeBaselineRow(item);
        if (parsed) out.set(parsed.symbol, parsed);
      }
      if (page.data.length < BASELINE_PAGE) break;
      from += BASELINE_PAGE;
    }
  } catch {
    return out;
  }
  return out;
}
