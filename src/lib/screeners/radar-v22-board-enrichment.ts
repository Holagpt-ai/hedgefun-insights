/**
 * Read-only radar_v22_board fetch for display-field enrichment on Sentinel rows.
 * Does not change Radar V2 source precedence or ranking.
 */

import { supabase } from "@/integrations/supabase/client";
import type { DisplayFieldDonor } from "@/lib/screeners/screener-display-enrichment";

const BOARD_DISPLAY_SELECT =
  "symbol,company_name,change_percent,volume,prior_session_volume,volume_ratio_prior_session";

export async function fetchRadarV22BoardDisplayDonors(
  limit = 200,
): Promise<DisplayFieldDonor[]> {
  const res = await supabase
    .from("radar_v22_board")
    .select(BOARD_DISPLAY_SELECT)
    .order("rank", { ascending: true })
    .limit(limit);

  if (res.error || !res.data) return [];
  return res.data as DisplayFieldDonor[];
}
