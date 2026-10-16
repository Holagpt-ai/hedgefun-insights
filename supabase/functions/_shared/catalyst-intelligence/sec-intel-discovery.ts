import {
  parseLoadedCheckpoint,
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
import type { SourceRunContext } from "./types.ts";

export type SecIntelCheckpoint = SecEdgarCheckpoint;

export function readSecIntelCheckpoint(metadata: Record<string, unknown>): SecIntelCheckpoint | null {
  const raw = metadata.sec_edgar_intel ?? metadata.checkpoint;
  const parsed = parseLoadedCheckpoint(raw);
  return parsed.ok ? parsed.checkpoint : null;
}

export function buildSecIntelCheckpoint(input: {
  page0Accessions: readonly string[];
  page0HeadUpdatedAt: string | null;
  pagesFetched: number;
  nowIso: string;
  prior: SecIntelCheckpoint | null;
}): SecIntelCheckpoint {
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
  | { ok: true; entries: SecFeedEntry[]; checkpoint: SecIntelCheckpoint; contentHash: string; unchanged: boolean }
  | { ok: false; reason: string; retryable: boolean; retryAfterSeconds: number | null }
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
  ctx.fetchState.providerHttpAttempts = summary.sec_requests;
  ctx.fetchState.providerHttpStatus = page0.status;
  ctx.fetchState.providerRetryAfterSeconds = page0.ok ? null : page0.retryAfterSeconds;
  if (!page0.ok) {
    const retryable = page0.reason === "PROVIDER_TIMEOUT" || page0.reason === "PROVIDER_RATE_LIMITED";
    return {
      ok: false,
      reason: page0.reason,
      retryable,
      retryAfterSeconds: page0.retryAfterSeconds,
    };
  }

  const contentHash = await hashPageText(page0.text);
  ctx.fetchState.contentHash = contentHash;
  const prior = readSecIntelCheckpoint(ctx.source.metadata);
  if (ctx.source.lastContentHash && ctx.source.lastContentHash === contentHash && prior) {
    return {
      ok: true,
      entries: [],
      checkpoint: prior,
      contentHash,
      unchanged: true,
    };
  }

  const fetchPage = async (url: string): Promise<SecFetchResult> => {
    assertHost(url);
    return await secFetch(url);
  };
  const anchors = prior?.anchor_accessions ?? null;
  const walk: PageWalkResult = await walkLatestFilingsPages(fetchPage, anchors);
  if (!walk.ok) {
    const retryable = walk.reason === "PROVIDER_TIMEOUT" || walk.reason === "PROVIDER_RATE_LIMITED";
    return { ok: false, reason: walk.reason, retryable, retryAfterSeconds: null };
  }

  const nowIso = ctx.now.toISOString();
  const checkpoint = buildSecIntelCheckpoint({
    page0Accessions: walk.page0Accessions,
    page0HeadUpdatedAt: walk.page0HeadUpdatedAt,
    pagesFetched: walk.pagesFetched,
    nowIso,
    prior,
  });

  return {
    ok: true,
    entries: walk.entries,
    checkpoint,
    contentHash,
    unchanged: false,
  };
}

export function checkpointForMetadata(checkpoint: SecIntelCheckpoint): Record<string, unknown> {
  return { sec_edgar_intel: checkpoint, checkpoint };
}
