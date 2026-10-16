import {
  walkLatestFilingsPages,
  type PageWalkResult,
  type SecEdgarCheckpoint,
  SEC_EDGAR_STREAM_KEY,
} from "../sec-edgar/checkpoint.ts";
import {
  buildLatestFilingsAtomUrl,
  createSecRequester,
  emptySecSummary,
  type SecFetchResult,
  type SecFeedEntry,
} from "../sec-edgar/ingest.ts";
import { MAX_ITEMS_PER_SOURCE } from "./config.ts";
import {
  entriesInAccessionOrder,
  readSecIntelContinuation,
  type SecIntelContinuation,
} from "./sec-intel-continuation.ts";
import {
  checkpointMetadataRecord,
  readSecIntelCheckpoint,
} from "./sec-intel-metadata.ts";
import type { SecFetchMetadataPatch } from "./sec-intel-continuation.ts";
import type { SourceRunContext } from "./types.ts";

export type { SecEdgarCheckpoint as SecIntelCheckpoint };
export { readSecIntelCheckpoint, checkpointMetadataRecord } from "./sec-intel-metadata.ts";

export function buildSecIntelCheckpoint(input: {
  page0Accessions: readonly string[];
  page0HeadUpdatedAt: string | null;
  pagesFetched: number;
  nowIso: string;
  prior: SecEdgarCheckpoint | null;
}): SecEdgarCheckpoint {
  const revision = input.prior ? input.prior.revision + 1 : 0;
  return {
    stream_key: SEC_EDGAR_STREAM_KEY,
    anchor_accessions: [...input.page0Accessions],
    revision,
    anchor_observed_at: input.nowIso,
    last_success_at: input.nowIso,
    head_updated_at: input.page0HeadUpdatedAt,
    pages_fetched: input.pagesFetched,
  };
}

export async function hashPageText(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function discoverSecFilingsPages(
  ctx: SourceRunContext,
  assertHost: (url: string) => void,
): Promise<
  | {
    ok: true;
    entries: SecFeedEntry[];
    proposedCheckpoint: SecEdgarCheckpoint;
    contentHash: string;
    unchanged: boolean;
    secRequests: number;
  }
  | { ok: false; reason: string; retryable: boolean; retryAfterSeconds: number | null; secRequests: number }
> {
  assertHost(ctx.source.url);
  const summary = emptySecSummary();
  const secFetch = createSecRequester(ctx.userAgent, summary, {
    fetchFn: ctx.fetchImpl,
    nowMs: () => ctx.now.getTime(),
    sleepFn: ctx.fetchImpl === fetch ? undefined : async () => {},
    retryRateLimit: false,
  });

  const page0Url = buildLatestFilingsAtomUrl(0);
  const page0 = await secFetch(page0Url);
  const secRequestsAfterPage0 = summary.sec_requests;
  ctx.fetchState.providerHttpAttempts = secRequestsAfterPage0;
  ctx.fetchState.providerHttpStatus = page0.status;
  ctx.fetchState.providerRetryAfterSeconds = page0.ok ? null : page0.retryAfterSeconds;
  if (!page0.ok) {
    const retryable = page0.reason === "PROVIDER_TIMEOUT" || page0.reason === "PROVIDER_RATE_LIMITED";
    return {
      ok: false,
      reason: page0.reason,
      retryable,
      retryAfterSeconds: page0.retryAfterSeconds,
      secRequests: secRequestsAfterPage0,
    };
  }

  const contentHash = await hashPageText(page0.text);
  ctx.fetchState.contentHash = contentHash;
  const prior = readSecIntelCheckpoint(ctx.source.metadata);
  const pending = readSecIntelContinuation(ctx.source.metadata);
  if (ctx.source.lastContentHash && ctx.source.lastContentHash === contentHash && prior && !pending) {
    return {
      ok: true,
      entries: [],
      proposedCheckpoint: prior,
      contentHash,
      unchanged: true,
      secRequests: secRequestsAfterPage0,
    };
  }

  const fetchPage = async (url: string): Promise<SecFetchResult> => {
    assertHost(url);
    return await secFetch(url);
  };
  const anchors = prior?.anchor_accessions ?? null;
  const walk: PageWalkResult = await walkLatestFilingsPages(fetchPage, anchors, undefined, page0);
  ctx.fetchState.providerHttpAttempts = summary.sec_requests;
  if (!walk.ok) {
    const retryable = walk.reason === "PROVIDER_TIMEOUT" || walk.reason === "PROVIDER_RATE_LIMITED";
    return {
      ok: false,
      reason: walk.reason,
      retryable,
      retryAfterSeconds: null,
      secRequests: summary.sec_requests,
    };
  }

  const nowIso = ctx.now.toISOString();
  const proposedCheckpoint = buildSecIntelCheckpoint({
    page0Accessions: walk.page0Accessions,
    page0HeadUpdatedAt: walk.page0HeadUpdatedAt,
    pagesFetched: walk.pagesFetched,
    nowIso,
    prior,
  });

  return {
    ok: true,
    entries: walk.entries,
    proposedCheckpoint,
    contentHash,
    unchanged: false,
    secRequests: summary.sec_requests,
  };
}

export function planSecIntelIngestBatch(input: {
  entries: readonly SecFeedEntry[];
  contentHash: string;
  proposedCheckpoint: SecEdgarCheckpoint;
  metadata: Record<string, unknown>;
  itemLimit: number;
  filterForm: (formType: string) => boolean;
}): {
  batchEntries: SecFeedEntry[];
  patch: SecFetchMetadataPatch;
} {
  const eligible = input.entries.filter((entry) => input.filterForm(entry.form_type));
  const seen = new Set<string>();
  const orderedEligible: SecFeedEntry[] = [];
  for (const entry of eligible) {
    if (seen.has(entry.accession_number)) continue;
    seen.add(entry.accession_number);
    orderedEligible.push(entry);
  }
  const batchAccessions = orderedEligible.map((e) => e.accession_number);
  const limit = input.itemLimit > 0 ? input.itemLimit : MAX_ITEMS_PER_SOURCE;
  const pending = readSecIntelContinuation(input.metadata);
  let startIndex = 0;
  if (pending && pending.page_content_hash === input.contentHash) {
    startIndex = pending.next_index;
  }
  const endIndex = Math.min(startIndex + limit, batchAccessions.length);
  const batchComplete = endIndex >= batchAccessions.length;
  const sliceAccessions = batchAccessions.slice(startIndex, endIndex);
  const batchEntries = entriesInAccessionOrder(orderedEligible, sliceAccessions);

  let continuation: SecIntelContinuation | null = null;
  if (!batchComplete) {
    continuation = {
      page_content_hash: input.contentHash,
      next_index: endIndex,
      batch_accessions: batchAccessions,
      pending_checkpoint: input.proposedCheckpoint,
    };
  }

  return {
    batchEntries,
    patch: {
      checkpoint: batchComplete ? checkpointMetadataRecord(input.proposedCheckpoint) : null,
      continuation,
      batchComplete,
    },
  };
}
