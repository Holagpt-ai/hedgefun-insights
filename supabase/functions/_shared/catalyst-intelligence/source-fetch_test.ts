import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { loadConfiguredSource } from "./source-fetch.ts";
import type { SourceRecord, SourceRunContext } from "./types.ts";

function ctx(
  partial: Partial<SourceRunContext> & Pick<SourceRunContext, "fetchImpl">,
): SourceRunContext {
  const url = "https://news.example.test/RssFeed/test";
  const source: SourceRecord = {
    id: "src-1",
    sourceKey: "globenewswire-earnings",
    companyName: null,
    ticker: null,
    cik: null,
    sourceType: "NEWS_PR",
    url,
    hostname: "news.example.test",
    feedFormat: "rss",
    pollIntervalSeconds: 180,
    enabled: true,
    priority: 10,
    evidenceTier: "TIER_2_STRONG_SECONDARY",
    authorityKey: "globenewswire",
    lastSuccessAt: null,
    lastContentHash: "prior-hash",
    lastEtag: '"feed-etag"',
    lastModified: "Wed, 01 Oct 2026 12:00:00 GMT",
    failureCount: 0,
    backoffUntil: null,
    lastErrorCategory: null,
    metadata: {},
  };
  return {
    now: new Date("2026-10-01T18:00:00.000Z"),
    source,
    userAgent: "test",
    itemLimit: 40,
    allowFixtures: false,
    fetchState: {
      unchanged: false,
      etag: null,
      lastModified: null,
      contentHash: null,
      checkpoint: null,
      forceFullFetch: partial.fetchState?.forceFullFetch,
    },
    fetchImpl: partial.fetchImpl,
  };
}

Deno.test("loadConfiguredSource omits conditional headers when forceFullFetch (NEWS continuation)", async () => {
  let ifNoneMatch: string | null = "unset";
  let ifModifiedSince: string | null = "unset";
  const body = "<rss><channel><title>GNW</title></channel></rss>";
  const runCtx = ctx({
    fetchImpl: (_url, init) => {
      const headers = new Headers(init?.headers);
      ifNoneMatch = headers.get("If-None-Match");
      ifModifiedSince = headers.get("If-Modified-Since");
      return Promise.resolve(new Response(body, { status: 200, headers: { etag: '"feed-etag"' } }));
    },
  });
  runCtx.fetchState.forceFullFetch = true;
  const loaded = await loadConfiguredSource(runCtx);
  assertEquals(ifNoneMatch, null);
  assertEquals(ifModifiedSince, null);
  assertEquals(loaded, body);
  assertEquals(runCtx.fetchState.unchanged, false);
});

Deno.test("loadConfiguredSource sends conditional headers on normal poll", async () => {
  let ifNoneMatch: string | null = null;
  const runCtx = ctx({
    fetchImpl: (_url, init) => {
      const headers = new Headers(init?.headers);
      ifNoneMatch = headers.get("If-None-Match");
      return Promise.resolve(new Response(null, { status: 304, statusText: "Not Modified" }));
    },
  });
  runCtx.fetchState.forceFullFetch = false;
  const loaded = await loadConfiguredSource(runCtx);
  assertEquals(ifNoneMatch, '"feed-etag"');
  assertEquals(loaded, null);
  assertEquals(runCtx.fetchState.unchanged, true);
});
