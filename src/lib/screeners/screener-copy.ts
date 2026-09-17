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
  const enrichmentNote =
    "Regular-session % change and prior-day volume may be enriched from a verified delayed snapshot when available; otherwise shown as —. RVOL and gap are not persisted by Radar V2.";

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
          `Radar V2 ${phrase} universe`,
          "Volume-first ranking",
          "Legacy $2–$20 / +10% / 5× snapshot gates not applied",
          "$2–$20 is a Trader Lens preset, not a Radar discovery gate",
        ],
      };
    case "volume_spikes":
    case "unusual_volume":
      return {
        description:
          `Radar V2 Sentinel ${phrase} volume/velocity activity ranked volume-first ` +
          `from the delayed market feed. ${enrichmentNote}`,
        criteria: [
          `Radar V2 ${phrase} volume / velocity`,
          "Volume-first ranking",
          "Prior-day volume enriched when verified snapshot aligns",
        ],
      };
    case "gainers_losers":
      return {
        description:
          `Radar V2 Sentinel ${phrase} movers ranked volume-first from the delayed market feed to surface emerging names early. ` +
          `${enrichmentNote} Short-window Radar movement is not presented as a day/session change.`,
        criteria: [
          `Radar V2 ${phrase} movers`,
          "Volume-first ranking",
          "MOVE enriched from verified regular-session snapshot when available",
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
