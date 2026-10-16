import { type SecFeedEntry } from "../../sec-edgar/ingest.ts";
import { MAX_ITEMS_PER_SOURCE } from "../config.ts";
import { buildRawItem, toUtcIso } from "../normalize.ts";
import {
  discoverSecFilingsPages,
  planSecIntelIngestBatch,
  SecIntelPendingGapError,
} from "../sec-intel-discovery.ts";
import type { CatalystSourceAdapter } from "../source-adapter.ts";
import { assertPublicHttpsUrl, SourceFetchError } from "../source-fetch.ts";
import type { NormalizedEventCandidate, RawSourceItem, SourceRunContext } from "../types.ts";

export const INTEL_SEC_FORMS = new Set([
  "8-K", "8-K/A", "10-Q", "10-Q/A", "10-K", "10-K/A",
  "S-3", "S-3/A", "424B2", "424B3", "424B4", "424B5", "424B7",
  "4", "4/A", "13D", "13D/A", "13G", "13G/A", "SC 13D", "SC 13G",
  "S-4", "S-4/A", "DEFM14A", "425",
]);

/** Routine ownership/disclosure forms — ingested but not promoted as high-materiality catalysts. */
export const ROUTINE_SEC_FORMS = new Set(["4", "4/A"]);

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
    const walk = await discoverSecFilingsPages(ctx, assertSecHost);
    if (!walk.ok) {
      const statusCode = ctx.fetchState.providerHttpStatus ?? null;
      const error = new SourceFetchError(walk.reason.toLowerCase(), statusCode, walk.retryable);
      error.retryAfterSeconds = walk.retryAfterSeconds;
      throw error;
    }
    ctx.fetchState.providerHttpAttempts = walk.secRequests;
    if (walk.unchanged) {
      ctx.fetchState.unchanged = true;
      ctx.fetchState.secIntelPatch = {
        checkpoint: null,
        continuation: null,
        batchComplete: true,
        workloadStartIndex: 0,
        successContentHash: null,
      };
      return [];
    }
    let batchEntries;
    let patch;
    try {
      ({ batchEntries, patch } = planSecIntelIngestBatch({
      entries: walk.entries,
      contentHash: walk.contentHash,
      proposedCheckpoint: walk.proposedCheckpoint,
      metadata: ctx.source.metadata,
      itemLimit: ctx.itemLimit || MAX_ITEMS_PER_SOURCE,
      filterForm: (form) => INTEL_SEC_FORMS.has(form),
      }));
    } catch (err) {
      if (err instanceof SecIntelPendingGapError) {
        throw new SourceFetchError("sec_intel_pending_gap", null, true);
      }
      throw err;
    }
    ctx.fetchState.secIntelPatch = patch;
    ctx.fetchState.checkpoint = patch.checkpoint;
    const items: RawSourceItem[] = [];
    for (const entry of batchEntries) items.push(await rawFromFiling(entry, ctx));
    return items;
  },
  async normalize(item, ctx) {
    if (!item.title) return null;
    const formType = typeof item.metadata.formType === "string" ? item.metadata.formType : null;
    return {
      raw: item,
      title: item.title,
      summary: item.summary,
      suggestedType: null,
      subtype: formType,
      scheduledStart: null,
      scheduledEnd: null,
      scheduledDate: null,
      isAnnouncement: true,
      evidenceTier: ctx.source.evidenceTier,
      metadata: {
        ...item.metadata,
        routineSecFiling: formType ? ROUTINE_SEC_FORMS.has(formType) : false,
      },
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
