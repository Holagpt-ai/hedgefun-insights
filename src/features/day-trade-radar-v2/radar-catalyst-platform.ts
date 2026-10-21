import type { SymbolCatalystPlatformContext } from "@/lib/catalyst/catalyst-platform-context";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import type { RecentProviderHeadline } from "@/lib/market-data/recent-news";
import {
  resolveRadarNewsCellState,
  resolveRadarNewsDisplay,
  type RadarNewsDisplay,
} from "@/features/day-trade-radar-v2/radar-news-display";

export function resolveRadarNewsCellStateWithPlatform(opts: {
  symbol: string;
  platform?: SymbolCatalystPlatformContext | null;
  catalyst?: CatalystEnrichmentEntry | undefined;
  recent?: RecentProviderHeadline | undefined;
  newsStatus: Parameters<typeof resolveRadarNewsCellState>[0]["newsStatus"];
  catalystPending?: boolean;
  catalystUnavailable?: boolean;
  nowMs?: number;
}): RadarNewsDisplay {
  const platform = opts.platform;
  if (opts.catalystPending) {
    if (platform?.availability === "verified" && platform.enrichment) {
      return resolveRadarNewsDisplay(
        opts.symbol,
        platform.enrichment,
        opts.recent,
        opts.nowMs,
      );
    }
    if (platform?.availability === "unavailable" || opts.catalystUnavailable) {
      if (opts.recent?.title && opts.recent.publishedAt) {
        return resolveRadarNewsDisplay(opts.symbol, undefined, opts.recent, opts.nowMs);
      }
      return { level: "unavailable" };
    }
    return { level: "pending" };
  }
  if (platform?.availability === "unavailable" || opts.catalystUnavailable) {
    if (opts.recent?.title && opts.recent.publishedAt) {
      return resolveRadarNewsDisplay(opts.symbol, undefined, opts.recent, opts.nowMs);
    }
    return { level: "unavailable" };
  }
  if (platform?.availability === "verified" && platform.enrichment) {
    return resolveRadarNewsDisplay(
      opts.symbol,
      platform.enrichment,
      opts.recent,
      opts.nowMs,
    );
  }
  if (platform?.availability === "none") {
    return resolveRadarNewsCellState({
      symbol: opts.symbol,
      catalyst: undefined,
      recent: opts.recent,
      newsStatus: opts.newsStatus,
      catalystPending: opts.catalystPending,
      catalystUnavailable: false,
      nowMs: opts.nowMs,
    });
  }
  return resolveRadarNewsCellState({
    symbol: opts.symbol,
    catalyst: opts.catalyst,
    recent: opts.recent,
    newsStatus: opts.newsStatus,
    catalystPending: opts.catalystPending,
    catalystUnavailable: opts.catalystUnavailable,
    nowMs: opts.nowMs,
  });
}
