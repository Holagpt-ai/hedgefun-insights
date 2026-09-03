/**
 * Session-aware Screener copy resolver (D5.1 semantic honesty pass).
 *
 * The static tab config (`screener-tabs.config.ts`) describes the regular-session
 * (RTH) / fallback qualification rules. During Radar V2 pre-market mode the
 * adapter does NOT apply those rules (no +10% vs prior close, no 5×/3×/4×
 * prior-day ratio, no prior-close % change), so the visible description and
 * criteria chips must not claim them.
 *
 * This resolver returns truthful, session-aware copy WITHOUT rewriting the
 * static RTH config. When the active data source is the existing verified
 * screener_results path, the original config copy is returned unchanged.
 */

import type { ScreenerTab } from "@/config/screener-tabs.config";

/** Which data source is currently populating a tab. */
export type ScreenerDataSource = "radar-v2" | "screener-results";

export interface ScreenerCopy {
  description: string;
  criteria: string[];
}

/**
 * Radar-backed pre-market copy per tab. Only the tabs the Radar V2 adapter can
 * back are overridden; everything else keeps the static RTH/fallback config.
 * Copy describes only what the adapter actually applies (volume-first discovery
 * from persisted volume/velocity), and explicitly flags fields that are not
 * available pre-market. No RVOL / prior-close / prior-day-ratio is claimed.
 */
const RADAR_V2_PM_COPY: Record<string, ScreenerCopy> = {
  day_trade_radar: {
    description:
      "Pre-market momentum and volume discovery from live Radar V2 candidates (Sentinel), " +
      "ranked by current volume on a 15-minute delayed feed. Regular-session price and volume " +
      "qualification does not apply pre-market.",
    criteria: [
      "Radar V2 pre-market candidates",
      "Volume-first ranking",
      "RTH price/volume gates not applied pre-market",
    ],
  },
  volume_spikes: {
    description:
      "Pre-market volume and velocity activity from Radar V2 (session volume, 60-second volume, " +
      "and acceleration). Ranked by current volume. A prior-day volume ratio is not available " +
      "pre-market and is shown as —.",
    criteria: [
      "Radar V2 pre-market volume / velocity",
      "Volume-first ranking",
      "Prior-day ratio unavailable pre-market",
    ],
  },
  unusual_volume: {
    description:
      "Pre-market unusual volume and velocity from Radar V2 (session volume, 60-second volume, " +
      "and acceleration). Ranked by current volume. A prior-day volume ratio is not available " +
      "pre-market and is shown as —.",
    criteria: [
      "Radar V2 pre-market volume / velocity",
      "Volume-first ranking",
      "Prior-day ratio unavailable pre-market",
    ],
  },
  gainers_losers: {
    description:
      "Pre-market Radar V2 movers ranked by current volume. A confirmed prior-close percentage " +
      "change is not available pre-market and is shown as —; short-window Radar movement is not " +
      "presented as a day/session change.",
    criteria: [
      "Radar V2 pre-market movers",
      "Volume-first ranking",
      "Prior-close % change unavailable pre-market",
    ],
  },
};

/**
 * Resolve the copy to display for a tab given the active data source.
 * Falls back to the static config copy for the verified screener_results path,
 * or for any tab that is not Radar-backed pre-market.
 */
export function resolveScreenerCopy(
  tab: ScreenerTab,
  source: ScreenerDataSource | null | undefined,
): ScreenerCopy {
  if (source === "radar-v2") {
    const pm = RADAR_V2_PM_COPY[tab.id];
    if (pm) return pm;
  }
  return { description: tab.description, criteria: tab.criteria };
}
