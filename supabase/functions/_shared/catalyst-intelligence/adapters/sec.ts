import {
  createSecRequester,
  emptySecSummary,
  parseLatestFilingsAtom,
  type SecFeedEntry,
} from "../../sec-edgar/ingest.ts";
import { MAX_ITEMS_PER_SOURCE } from "../config.ts";
import { buildRawItem, toUtcIso } from "../normalize.ts";
import type { CatalystSourceAdapter } from "../source-adapter.ts";
import { assertPublicHttpsUrl, SourceFetchError } from "../source-fetch.ts";
import type { NormalizedEventCandidate, RawSourceItem, SourceRunContext } from "../types.ts";

export const INTEL_SEC_FORMS = new Set([
  "8-K", "8-K/A", "10-Q", "10-Q/A", "10-K", "10-K/A",
  "S-3", "S-3/A", "424B2", "424B3", "424B4", "424B5", "424B7",
  "4", "4/A", "13D", "13D/A", "13G", "13G/A", "SC 13D", "SC 13G",
  "S-4", "S-4/A", "DEFM14A", "425",
]);

function assertSecHost(url: string): void {
  const parsed = assertPublicHttpsUrl(url);
  const host = parsed.hostname.toLowerCase();
  if (host !== "sec.gov" && !host.endsWith(".sec.gov")) {
    throw new SourceFetchError("unsafe_url", null, false);
  }
}

export const secFilingsAdapter: CatalystSourceAdapter = {
  id: "sec-filings",
  sourceType: "SEC_FILINGS",
  async discover(ctx) {
    assertSecHost(ctx.source.url);
    const summary = emptySecSummary();
    const secFetch = createSecRequester(ctx.userAgent, summary, {
      fetchFn: ctx.fetchImpl,
      nowMs: () => ctx.now.getTime(),
      sleepFn: ctx.fetchImpl === fetch ? undefined : async () => {},
      retryRateLimit: false,
    });
    const result = await secFetch(ctx.source.url);
    ctx.fetchState.providerHttpAttempts = summary.sec_requests;
    ctx.fetchState.providerHttpStatus = result.status;
    ctx.fetchState.providerRetryAfterSeconds = result.ok ? null : result.retryAfterSeconds;
    if (!result.ok) {
      const retryable = result.reason === "PROVIDER_TIMEOUT" || result.reason === "PROVIDER_RATE_LIMITED";
      const error = new SourceFetchError(result.reason.toLowerCase(), result.status, retryable);
      error.retryAfterSeconds = result.retryAfterSeconds;
      throw error;
    }
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(result.text));
    ctx.fetchState.contentHash = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
    if (ctx.source.lastContentHash && ctx.source.lastContentHash === ctx.fetchState.contentHash) {
      ctx.fetchState.unchanged = true;
      return [];
    }
    const entries = parseLatestFilingsAtom(result.text)
      .filter((entry) => INTEL_SEC_FORMS.has(entry.form_type))
      .slice(0, ctx.itemLimit || MAX_ITEMS_PER_SOURCE);
    const items: RawSourceItem[] = [];
    for (const entry of entries) items.push(await rawFromFiling(entry, ctx));
    const start = Number((ctx.source.metadata.checkpoint as { start?: number } | undefined)?.start ?? 0);
    ctx.fetchState.checkpoint = { start: entries.length > 0 ? start : 0, seen: entries.length };
    return items;
  },
  async normalize(item, ctx) {
    if (!item.title) return null;
    return {
      raw: item,
      title: item.title,
      summary: item.summary,
      suggestedType: null,
      subtype: typeof item.metadata.formType === "string" ? item.metadata.formType : null,
      scheduledStart: null,
      scheduledEnd: null,
      scheduledDate: null,
      isAnnouncement: true,
      evidenceTier: ctx.source.evidenceTier,
      metadata: item.metadata,
    } satisfies NormalizedEventCandidate;
  },
};

async function rawFromFiling(entry: SecFeedEntry, ctx: SourceRunContext): Promise<RawSourceItem> {
  const published = toUtcIso(entry.accepted_at);
  return await buildRawItem({
    sourceId: ctx.source.id,
    sourceType: "SEC_FILINGS",
    externalId: entry.accession_number,
    canonicalUrl: entry.filing_url,
    publishedAt: published,
    discoveredAt: ctx.now.toISOString(),
    title: entry.company_name
      ? `${entry.company_name} filed Form ${entry.form_type}`
      : `Form ${entry.form_type} filed`,
    summary: entry.sec_items?.length
      ? `Form ${entry.form_type} — Items ${entry.sec_items.join(", ")}`
      : `Form ${entry.form_type} filed with the SEC.`,
    metadata: {
      formType: entry.form_type,
      cik: entry.cik,
      accession: entry.accession_number,
      filingDate: entry.filing_date,
      secItems: entry.sec_items,
      companyName: entry.company_name,
    },
  });
}
