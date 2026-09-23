/**
 * Session-aware Screener copy resolver (D5.1 / D12).
 *
 * The static tab config (`screener-tabs.config.ts`) describes the legacy
 * regular-session / fallback qualification rules. When Radar V2 is the accepted
 * source, those rules are NOT applied (no +10% vs prior close, no 5×/3×/4×
 * prior-day ratio, no prior-close % change), so the visible description and
 * criteria chips must not claim them.
 *
 * Copy is keyed by the accepted Radar generation's `session_kind` — never by
 * the browser clock. Gappers / New Highs-Lows keep static config copy.
 */

import type { ScreenerTab } from "@/config/screener-tabs.config";

/** Which data source is currently populating a tab. */
export type ScreenerDataSource = "radar-v2" | "screener-results";

export interface ScreenerCopy {
  description: string;
  criteria: string[];
}

function radarSessionPhrase(session: string | null | undefined): string {
  if (session === "market") return "regular-session";
  if (session === "after-hours") return "after-hours";
  if (session === "pre-market") return "pre-market";
  return "current-session";
}

const RADAR_V2_NEUTRAL_COPY_TABS = new Set([
  "day_trade_radar",
  "volume_spikes",
  "unusual_volume",
  "gainers_losers",
]);

function radarV2CopyFor(tabId: string, _session: string | null | undefined): ScreenerCopy | null {
  if (RADAR_V2_NEUTRAL_COPY_TABS.has(tabId)) {
    return { description: "", criteria: [] };
  }
  return null;
}

/**
 * Resolve the copy to display for a tab given the active data source and the
 * accepted Radar generation session. Static config copy is used for the
 * verified screener_results path and for tabs that are not Radar-backed.
 */
export function resolveScreenerCopy(
  tab: ScreenerTab,
  source: ScreenerDataSource | null | undefined,
  session?: string | null,
): ScreenerCopy {
  if (source === "radar-v2") {
    const radar = radarV2CopyFor(tab.id, session);
    if (radar) return radar;
  }
  return { description: tab.description, criteria: tab.criteria };
}
