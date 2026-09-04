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

function radarV2CopyFor(tabId: string, session: string | null | undefined): ScreenerCopy | null {
  const phrase = radarSessionPhrase(session);
  const honesty = "RVOL / prior-close % / gap are not persisted by Radar V2 and are shown as —.";

  switch (tabId) {
    case "day_trade_radar":
      return {
        description:
          session === "market"
            ? "Radar V2 Sentinel regular-session candidates ranked volume-first from the delayed market feed."
            : session === "after-hours"
              ? "Radar V2 Sentinel after-hours candidates ranked volume-first from the delayed market feed."
              : session === "pre-market"
                ? "Radar V2 Sentinel pre-market candidates ranked volume-first from the delayed market feed."
                : `Radar V2 Sentinel ${phrase} candidates ranked volume-first from the delayed market feed.`,
        criteria: [
          `Radar V2 ${phrase} candidates`,
          "Volume-first ranking",
          "Legacy $2–$20 / +10% / 5× snapshot gates not applied",
        ],
      };
    case "volume_spikes":
    case "unusual_volume":
      return {
        description:
          `Radar V2 Sentinel ${phrase} volume and velocity activity ranked volume-first ` +
          `from the delayed market feed. ${honesty}`,
        criteria: [
          `Radar V2 ${phrase} volume / velocity`,
          "Volume-first ranking",
          "Prior-day ratio unavailable from Radar V2",
        ],
      };
    case "gainers_losers":
      return {
        description:
          `Radar V2 Sentinel ${phrase} movers ranked volume-first from the delayed market feed. ` +
          "A confirmed prior-close percentage change is not persisted by Radar V2 and is shown as —; " +
          "short-window Radar movement is not presented as a day/session change.",
        criteria: [
          `Radar V2 ${phrase} movers`,
          "Volume-first ranking",
          "Prior-close % change unavailable from Radar V2",
        ],
      };
    default:
      return null;
  }
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
