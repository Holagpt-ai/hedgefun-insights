import { MAX_ITEMS_PER_SOURCE } from "../config.ts";
import {
  detectFeedFormat,
  parseHtmlArticles,
  parseJsonItems,
  parseRssOrAtom,
  parseSitemap,
  type ParsedFeedItem,
} from "../feeds.ts";
import { extractExplicitScheduledDates } from "../announcement-dates.ts";
import { buildRawItem } from "../normalize.ts";
import type { CatalystSourceAdapter } from "../source-adapter.ts";
import { loadConfiguredSource } from "../source-fetch.ts";
import type { NormalizedEventCandidate, RawSourceItem, SourceRunContext } from "../types.ts";

export const companyIrAdapter: CatalystSourceAdapter = {
  id: "company-ir",
  sourceType: "COMPANY_IR",
  discover: (ctx) => discoverParsed(ctx, (body, format) => {
    if (format === "json") return parseJsonItems(body);
    if (format === "html") return parseHtmlArticles(body);
    if (format === "sitemap") return parseSitemap(body);
    if (format === "auto") {
      const detected = detectFeedFormat(body);
      if (detected === "json") return parseJsonItems(body);
      if (detected === "html") return parseHtmlArticles(body);
      if (detected === "sitemap") return parseSitemap(body);
      return parseRssOrAtom(body);
    }
    return parseRssOrAtom(body);
  }),
  normalize: (item, ctx) => normalizeIr(item, ctx),
};

async function discoverParsed(
  ctx: SourceRunContext,
  parse: (body: string, format: SourceRunContext["source"]["feedFormat"]) => ParsedFeedItem[],
): Promise<RawSourceItem[]> {
  const body = await loadConfiguredSource(ctx);
  if (body == null) return [];
  const parsed = parse(body, ctx.source.feedFormat).slice(0, ctx.itemLimit || MAX_ITEMS_PER_SOURCE);
  const items: RawSourceItem[] = [];
  for (const item of parsed) {
    items.push(await buildRawItem({
      sourceId: ctx.source.id,
      sourceType: ctx.source.sourceType,
      externalId: item.externalId,
      canonicalUrl: item.url,
      publishedAt: item.publishedAt,
      discoveredAt: ctx.now.toISOString(),
      title: item.title,
      summary: item.summary,
      metadata: { ...item.metadata, scheduledStart: item.scheduledStart, scheduledEnd: item.scheduledEnd, scheduledDate: item.scheduledDate },
    }));
  }
  return items;
}

async function normalizeIr(item: RawSourceItem, ctx: SourceRunContext): Promise<NormalizedEventCandidate | null> {
  if (!item.title?.trim()) return null;
  const text = `${item.title} ${item.summary ?? ""}`;
  const extracted = extractExplicitScheduledDates(text, item.publishedAt);
  const scheduledStart = typeof item.metadata.scheduledStart === "string"
    ? item.metadata.scheduledStart
    : extracted.scheduledStart;
  const scheduledDate = typeof item.metadata.scheduledDate === "string"
    ? item.metadata.scheduledDate
    : extracted.scheduledDate;
  return {
    raw: item,
    title: item.title,
    summary: item.summary,
    suggestedType: null,
    subtype: null,
    scheduledStart,
    scheduledEnd: typeof item.metadata.scheduledEnd === "string" ? item.metadata.scheduledEnd : null,
    scheduledDate,
    isAnnouncement: true,
    evidenceTier: ctx.source.evidenceTier,
    metadata: item.metadata,
  };
}

export { discoverParsed };
