/**
 * Canonical user-facing market-data trust states (Screeners, Watchlist, Pre-Market).
 * Classifications derive only from source timestamps and existing product contracts.
 */

import {
  parseTimestampMs,
  SCREENER_STALE_AFTER_MS,
  type ScreenerUiStatus,
} from "@/lib/screeners/contract";
import {
  deriveMarketFeedDisplayTier,
  formatSubSecondAge,
  type MarketFeedTelemetry,
} from "@/lib/market-feed/telemetry";
import { isExpired } from "@/lib/watchlist-v2/parsers";
import type { SectionEnvelope } from "@/types/pre-market";

export type MarketDataTrustState = "FRESH" | "DELAYED" | "STALE" | "UNAVAILABLE" | "CLOSED";

/** Generation snapshot stale boundary (existing screener contract). */
export { SCREENER_STALE_AFTER_MS as SCREENER_GENERATION_STALE_AFTER_MS };

/** Watchlist snapshot stale boundary (`watchlist-v2/market-data` STALE_MS). */
export const WATCHLIST_SNAPSHOT_STALE_MS = 45 * 60_000;

/** Pre-Market contract (`INDEX_STALE_MINUTES`). */
export const PRE_MARKET_INDEX_STALE_MS = 20 * 60_000;

/** Pre-Market contract (`SCREENER_STALE_MINUTES`). */
export const PRE_MARKET_SCREENER_STALE_MS = 30 * 60_000;

export function trustStateLabel(state: MarketDataTrustState): string {
  switch (state) {
    case "FRESH":
      return "Fresh";
    case "DELAYED":
      return "Delayed";
    case "STALE":
      return "Stale";
    case "UNAVAILABLE":
      return "Unavailable";
    case "CLOSED":
      return "Closed";
  }
}

export function parseTrustSourceMs(
  value: string | number | null | undefined,
): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  return parseTimestampMs(value);
}

/** Binary age vs an existing stale boundary — no invented Fresh/Delayed split. */
export function classifyAgeAgainstStaleBoundary(
  ageMs: number | null,
  staleAfterMs: number,
): MarketDataTrustState {
  if (ageMs === null || !Number.isFinite(ageMs) || ageMs < 0) {
    return "UNAVAILABLE";
  }
  if (ageMs > staleAfterMs) return "STALE";
  return "FRESH";
}

export function formatMarketDataTrustLine(
  state: MarketDataTrustState,
  sourceIso: string | null,
  nowMs: number,
): string {
  const label = trustStateLabel(state);
  if (state === "UNAVAILABLE") return label;
  const ago = formatSubSecondAge(sourceIso, nowMs);
  return ago ? `${label} · updated ${ago}` : label;
}

export function trustStateTone(state: MarketDataTrustState): string {
  switch (state) {
    case "FRESH":
      return "text-emerald-600 dark:text-emerald-400";
    case "DELAYED":
      return "text-muted-foreground";
    case "STALE":
      return "text-amber-700 dark:text-amber-400";
    case "UNAVAILABLE":
      return "text-muted-foreground";
    case "CLOSED":
      return "text-muted-foreground";
  }
}

function mapFeedTierToTrust(
  tier: ReturnType<typeof deriveMarketFeedDisplayTier>,
): MarketDataTrustState | null {
  if (tier === "streaming" || tier === "near_realtime") return "FRESH";
  if (tier === "delayed") return "DELAYED";
  if (tier === "stale") return "STALE";
  return null;
}

export function resolveScreenerMarketDataTrust(input: {
  status: ScreenerUiStatus;
  syncedAt?: string | null;
  providerAsOfMax?: string | null;
  marketFeed?: MarketFeedTelemetry | null;
  nowMs?: number;
}): MarketDataTrustState {
  const nowMs = input.nowMs ?? Date.now();
  if (input.status === "unavailable") return "UNAVAILABLE";
  if (input.status === "stale") return "STALE";

  const tier = input.marketFeed
    ? deriveMarketFeedDisplayTier(input.marketFeed, nowMs)
    : null;
  const fromFeed = tier ? mapFeedTierToTrust(tier) : null;
  if (fromFeed) return fromFeed;

  const sourceIso = input.marketFeed?.last_message_at ??
    input.syncedAt ??
    input.providerAsOfMax ??
    null;
  const sourceMs = parseTrustSourceMs(sourceIso);
  if (sourceMs === null) return "UNAVAILABLE";
  const ageMs = nowMs - sourceMs;
  return classifyAgeAgainstStaleBoundary(ageMs, SCREENER_STALE_AFTER_MS);
}

export function resolveWatchlistMarketDataTrust(input: {
  hasV2: boolean;
  validThrough: string | null | undefined;
  snapshotTsMs: number | null | undefined;
  analysisPresentation?: "live" | "last_completed" | null;
  nowMs?: number;
}): MarketDataTrustState {
  const nowMs = input.nowMs ?? Date.now();
  if (!input.hasV2) return "UNAVAILABLE";
  const sourceMs = parseTrustSourceMs(input.snapshotTsMs ?? null);
  if (sourceMs === null) return "UNAVAILABLE";
  if (input.analysisPresentation === "last_completed") return "CLOSED";
  if (isExpired(input.validThrough, new Date(nowMs))) return "STALE";
  const ageMs = nowMs - sourceMs;
  if (ageMs > WATCHLIST_SNAPSHOT_STALE_MS) return "STALE";
  return "FRESH";
}

export function resolvePreMarketSectionTrust(
  section: Pick<
    SectionEnvelope<unknown>,
    "status" | "as_of" | "reason_code"
  > | null,
  staleAfterMs: number = PRE_MARKET_INDEX_STALE_MS,
  nowMs: number = Date.now(),
): MarketDataTrustState {
  if (!section) return "UNAVAILABLE";
  if (section.status === "unavailable" || section.status === "empty") {
    return "UNAVAILABLE";
  }
  if (section.status === "stale") {
    if (section.reason_code === "REFRESH_UNAVAILABLE") return "DELAYED";
    return "STALE";
  }
  const sourceMs = parseTrustSourceMs(section.as_of);
  if (sourceMs === null) return "UNAVAILABLE";
  const ageMs = nowMs - sourceMs;
  return classifyAgeAgainstStaleBoundary(ageMs, staleAfterMs);
}
