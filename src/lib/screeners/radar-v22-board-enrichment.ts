/**
 * Read-only radar_v22_board fetch for display-field enrichment on Sentinel rows.
 * Does not change Radar V2 source precedence or ranking.
 */

import { supabase } from "@/integrations/supabase/client";
import type { DisplayFieldDonor } from "@/lib/screeners/screener-display-enrichment";

const BOARD_DISPLAY_SELECT =
  "symbol,company_name,change_percent,price,volume,prior_session_volume,volume_ratio_prior_session,provider_as_of,generation_id,updated_at";

type RadarV22BoardDisplayRow = {
  symbol: string;
  company_name: string | null;
  change_percent: number;
  price: number;
  volume: number;
  prior_session_volume: number;
  volume_ratio_prior_session: number;
  provider_as_of: string;
  generation_id: string;
  updated_at: string;
};

export async function fetchRadarV22BoardDisplayDonors(
  limit = 200,
): Promise<DisplayFieldDonor[]> {
  const res = await supabase
    .from("radar_v22_board")
    .select(BOARD_DISPLAY_SELECT)
    .order("rank", { ascending: true })
    .limit(limit);

  if (res.error || !res.data) return [];
  return (res.data as RadarV22BoardDisplayRow[]).map((row) => ({
    symbol: row.symbol,
    company_name: row.company_name,
    change_percent: row.change_percent,
    price: row.price,
    volume: row.volume,
    prior_session_volume: row.prior_session_volume,
    volume_ratio_prior_session: row.volume_ratio_prior_session,
    provider_as_of: row.provider_as_of,
    sync_run_id: row.generation_id,
    updated_at: row.updated_at,
  }));
}
