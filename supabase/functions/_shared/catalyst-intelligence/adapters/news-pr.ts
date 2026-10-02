import { parseJsonItems, parseRssOrAtom } from "../feeds.ts";
import { applyGlobeNewswireTickerMetadata } from "../globenewswire-ticker.ts";
import { buildRawItem } from "../normalize.ts";
import type { CatalystSourceAdapter } from "../source-adapter.ts";
import { loadConfiguredSource } from "../source-fetch.ts";
import { MAX_ITEMS_PER_SOURCE } from "../config.ts";
import type { NormalizedEventCandidate, RawSourceItem, SourceRunContext } from "../types.ts";

export const newsPrAdapter: CatalystSourceAdapter = {
  id: "news-pr",
  sourceType: "NEWS_PR",
  async discover(ctx) {
    const body = await loadConfiguredSource(ctx);
    if (body == null) return [];
    const format = ctx.source.feedFormat;
    const parsed = (format === "json" || body.trim().startsWith("{") || body.trim().startsWith("[")
      ? parseJsonItems(body)
      : parseRssOrAtom(body)).slice(0, ctx.itemLimit || MAX_ITEMS_PER_SOURCE);
    const items: RawSourceItem[] = [];
    for (const item of parsed) {
      items.push(await buildRawItem({
        sourceId: ctx.source.id,
        sourceType: "NEWS_PR",
        externalId: item.externalId,
        canonicalUrl: item.url,
        publishedAt: item.publishedAt,
        discoveredAt: ctx.now.toISOString(),
        title: item.title,
        summary: item.summary,
        metadata: item.metadata,
      }));
    }
    return items;
  },
  async normalize(item, ctx) {
    if (!item.title?.trim()) return null;
    const metadata = { ...item.metadata };
    applyGlobeNewswireTickerMetadata(metadata, ctx.source, ctx.companies);
    const raw = { ...item, metadata };
    return {
      raw,
      title: item.title,
      summary: item.summary,
      suggestedType: null,
      subtype: null,
      scheduledStart: null,
      scheduledEnd: null,
      scheduledDate: null,
      isAnnouncement: true,
      evidenceTier: ctx.source.evidenceTier,
      metadata,
    } satisfies NormalizedEventCandidate;
  },
};
