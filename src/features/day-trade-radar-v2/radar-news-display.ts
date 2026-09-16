import { EVENT_TYPE_LABEL } from "@/lib/catalyst/parsers";
import { catalystSymbolHref } from "@/lib/catalyst/enrichment";
import type { CatalystEnrichmentEntry } from "@/lib/catalyst/enrichment";
import type { RecentProviderHeadline } from "@/lib/market-data/recent-news";

export type RadarNewsDisplay =
  | {
      level: "catalyst";
      category: string;
      title: string;
      href: string;
      publishedAt: string | null;
    }
  | {
      level: "recent";
      title: string;
      publishedAt: string | null;
      href: string | null;
    }
  | { level: "none" };

export const NO_VERIFIED_NEWS_COPY = "No verified news found";

export function resolveRadarNewsDisplay(
  symbol: string,
  catalyst: CatalystEnrichmentEntry | undefined,
  recent: RecentProviderHeadline | undefined,
): RadarNewsDisplay {
  if (catalyst?.event) {
    const category =
      EVENT_TYPE_LABEL[catalyst.event.event_type as keyof typeof EVENT_TYPE_LABEL] ?? "Catalyst";
    const title = catalyst.event.title?.trim() || category;
    return {
      level: "catalyst",
      category,
      title,
      href: catalystSymbolHref(symbol) ?? `/dashboard/catalyst?symbol=${encodeURIComponent(symbol)}`,
      publishedAt: catalyst.event.published_at ?? null,
    };
  }
  if (recent?.title) {
    return {
      level: "recent",
      title: recent.title,
      publishedAt: recent.publishedAt,
      href: recent.url,
    };
  }
  return { level: "none" };
}
