import { EVENT_TYPE_LABEL } from "@/lib/catalyst/parsers";
import { catalystSymbolHref } from "@/lib/catalyst/enrichment";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import type { RecentProviderHeadline, RadarNewsSymbolStatus } from "@/lib/market-data/recent-news";

export type { RadarNewsSymbolStatus };

export type RadarNewsDisplay =
  | {
      level: "catalyst";
      category: string;
      title: string;
      href: string;
      publishedAt: string | null;
      ageLabel: string | null;
    }
  | {
      level: "recent";
      title: string;
      publishedAt: string;
      href: string | null;
      source: string;
      ageLabel: string | null;
    }
  | { level: "none" }
  | { level: "pending" }
  | { level: "unavailable" };

export const NO_VERIFIED_NEWS_COPY = "No verified news found";

export function formatRadarNewsAge(
  publishedAt: string | null | undefined,
  nowMs: number = Date.now(),
): string | null {
  if (!publishedAt) return null;
  const ms = Date.parse(publishedAt);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const mins = Math.max(0, Math.floor((nowMs - ms) / 60000));
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function resolveRadarNewsDisplay(
  symbol: string,
  catalyst: CatalystEnrichmentEntry | undefined,
  recent: RecentProviderHeadline | undefined,
  nowMs: number = Date.now(),
): RadarNewsDisplay {
  if (catalyst?.event) {
    const category =
      EVENT_TYPE_LABEL[catalyst.event.event_type as keyof typeof EVENT_TYPE_LABEL] ?? "Catalyst";
    const title = catalyst.event.title?.trim() || category;
    const publishedAt = catalyst.event.published_at ?? null;
    return {
      level: "catalyst",
      category,
      title,
      href: catalystSymbolHref(symbol) ?? `/dashboard/catalyst?symbol=${encodeURIComponent(symbol)}`,
      publishedAt,
      ageLabel: formatRadarNewsAge(publishedAt, nowMs),
    };
  }
  if (recent?.title && recent.publishedAt) {
    const ageLabel = formatRadarNewsAge(recent.publishedAt, nowMs);
    if (!ageLabel) return { level: "none" };
    return {
      level: "recent",
      title: recent.title,
      publishedAt: recent.publishedAt,
      href: recent.url,
      source: recent.source,
      ageLabel,
    };
  }
  return { level: "none" };
}

export function resolveRadarNewsCellState(opts: {
  symbol: string;
  catalyst: CatalystEnrichmentEntry | undefined;
  recent: RecentProviderHeadline | undefined;
  newsStatus: RadarNewsSymbolStatus;
  catalystPending?: boolean;
  nowMs?: number;
}): RadarNewsDisplay {
  const display = resolveRadarNewsDisplay(opts.symbol, opts.catalyst, opts.recent, opts.nowMs);
  if (display.level === "catalyst" || display.level === "recent") return display;
  if (opts.catalystPending || opts.newsStatus === "pending") return { level: "pending" };
  if (opts.newsStatus === "unavailable") return { level: "unavailable" };
  return { level: "none" };
}
