import { MAX_ITEMS_PER_SOURCE } from "../config.ts";
import {
  detectFeedFormat,
  parseHtmlArticles,
  parseIcsEvents,
  parseJsonItems,
  parseJsonLdEvents,
  parseRssOrAtom,
  type ParsedFeedItem,
} from "../feeds.ts";
import { buildRawItem } from "../normalize.ts";
import type { CatalystSourceAdapter } from "../source-adapter.ts";
import { loadConfiguredSource } from "../source-fetch.ts";
import type { NormalizedEventCandidate, RawSourceItem, SourceRunContext } from "../types.ts";

export const companyEventsAdapter: CatalystSourceAdapter = {
  id: "company-events",
  sourceType: "COMPANY_EVENTS",
  async discover(ctx) {
    const body = await loadConfiguredSource(ctx);
    if (body == null) return [];
    const format = ctx.source.feedFormat === "auto" ? detectFeedFormat(body) : ctx.source.feedFormat;
    const parsed = parseEvents(body, format).slice(0, ctx.itemLimit || MAX_ITEMS_PER_SOURCE);
    const items: RawSourceItem[] = [];
    for (const item of parsed) {
      items.push(await buildRawItem({
        sourceId: ctx.source.id,
        sourceType: "COMPANY_EVENTS",
        externalId: item.externalId,
        canonicalUrl: item.url,
        publishedAt: item.publishedAt,
        discoveredAt: ctx.now.toISOString(),
        title: item.title,
        summary: item.summary,
        metadata: {
          ...item.metadata,
          scheduledStart: item.scheduledStart,
          scheduledEnd: item.scheduledEnd,
          scheduledDate: item.scheduledDate,
        },
      }));
    }
    return items;
  },
  async normalize(item, ctx) {
    if (!item.title?.trim()) return null;
    const scheduledStart = typeof item.metadata.scheduledStart === "string" ? item.metadata.scheduledStart : null;
    const scheduledDate = typeof item.metadata.scheduledDate === "string" ? item.metadata.scheduledDate : null;
    return {
      raw: item,
      title: item.title,
      summary: item.summary,
      suggestedType: null,
      subtype: null,
      scheduledStart,
      scheduledEnd: typeof item.metadata.scheduledEnd === "string" ? item.metadata.scheduledEnd : null,
      scheduledDate,
      isAnnouncement: false,
      evidenceTier: ctx.source.evidenceTier,
      metadata: item.metadata,
    } satisfies NormalizedEventCandidate;
  },
};

function parseEvents(body: string, format: string): ParsedFeedItem[] {
  if (format === "ics") return parseIcsEvents(body);
  if (format === "json") return parseJsonItems(body);
  if (format === "jsonld") return parseJsonLdEvents(body);
  if (format === "html") return [...parseJsonLdEvents(body), ...parseHtmlArticles(body)];
  if (format === "rss" || format === "atom") return parseRssOrAtom(body);
  return [...parseJsonLdEvents(body), ...parseIcsEvents(body), ...parseRssOrAtom(body)];
}
