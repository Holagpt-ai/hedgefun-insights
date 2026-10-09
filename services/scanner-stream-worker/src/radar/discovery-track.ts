import type { RadarV22Config } from "./config.ts";
import {
  effectivePromotionCap,
  RADAR_PROMOTION_HARD_MAX,
} from "./config.ts";
import { evaluatePromotion } from "./sentinel.ts";
import type { EligibleQuote, SentinelMetrics } from "./types.ts";

/** Bounded Stage-2 extension for Penny / Breakouts panels (not Day Trade rank cap). */
export const DISCOVERY_TRACK_CAP_DEFAULT = 48;

export function effectiveDiscoveryTrackCap(config: RadarV22Config): number {
  const mainCap = effectivePromotionCap(config);
  const requested = Math.max(
    0,
    Math.trunc(config.discoveryTrackCap ?? DISCOVERY_TRACK_CAP_DEFAULT),
  );
  return Math.min(requested, Math.max(0, RADAR_PROMOTION_HARD_MAX - mainCap));
}

/** Matches frontend penny default band (`qualifiesPennyPrice` under_1). */
export function pennyPanelPriceEligible(
  lastPrice: number | null | undefined,
): boolean {
  return typeof lastPrice === "number" &&
    Number.isFinite(lastPrice) &&
    lastPrice > 0 &&
    lastPrice < 1;
}

export function resolveDiscoveryLastPrice(
  metrics: SentinelMetrics | null,
  quote: EligibleQuote | null | undefined,
): number | null {
  const fromMetrics = metrics?.lastClose;
  if (typeof fromMetrics === "number" && Number.isFinite(fromMetrics) && fromMetrics > 0) {
    return fromMetrics;
  }
  const fromQuote = quote?.regularClose;
  if (typeof fromQuote === "number" && Number.isFinite(fromQuote) && fromQuote > 0) {
    return fromQuote;
  }
  return null;
}

export function passesSentinelPromotionGate(
  metrics: SentinelMetrics | null,
  config: RadarV22Config,
): boolean {
  if (!metrics) return false;
  return evaluatePromotion(metrics, config).promote;
}

/**
 * Symbols blocked by the main promotion cap but still worth Stage-2 book ingest:
 * sentinel promotion pass plus penny price OR any tape strong enough for breakout
 * event evaluation once on RadarBook.
 */
export function discoveryTrackPrefilter(
  metrics: SentinelMetrics | null,
  quote: EligibleQuote | null | undefined,
  config: RadarV22Config,
): boolean {
  if (!passesSentinelPromotionGate(metrics, config)) return false;
  const price = resolveDiscoveryLastPrice(metrics, quote);
  if (pennyPanelPriceEligible(price)) return true;
  return true;
}

export type DiscoveryCandidateScore = {
  symbol: string;
  score: number;
  lastEndMs: number;
};

export function scoreDiscoveryCandidate(
  metrics: SentinelMetrics,
): number {
  const dollar60 = metrics.dollarVol60s;
  if (typeof dollar60 === "number" && Number.isFinite(dollar60) && dollar60 > 0) {
    return dollar60;
  }
  return metrics.vol60s ?? 0;
}

export function rankDiscoveryCandidates(
  entries: DiscoveryCandidateScore[],
): DiscoveryCandidateScore[] {
  return [...entries].sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
}
