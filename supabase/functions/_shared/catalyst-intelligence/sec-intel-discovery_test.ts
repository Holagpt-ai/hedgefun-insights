import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSecIntelCheckpoint,
} from "./sec-intel-discovery.ts";
import {
  applySecFetchMetadataToSource,
  readSecIntelCheckpoint,
} from "./sec-intel-metadata.ts";
import { SEC_EDGAR_STREAM_KEY } from "../sec-edgar/checkpoint.ts";
import type { SourceRecord } from "./types.ts";

Deno.test("readSecIntelCheckpoint reads direct checkpoint on metadata.checkpoint", () => {
  const checkpoint = buildSecIntelCheckpoint({
    page0Accessions: ["0000320193-24-000123"],
    page0HeadUpdatedAt: "2024-01-02T12:00:00Z",
    pagesFetched: 1,
    nowIso: "2024-01-02T12:05:00Z",
    prior: null,
  });
  const read = readSecIntelCheckpoint({ checkpoint: { ...checkpoint } });
  assert(read);
  assertEquals(read.stream_key, SEC_EDGAR_STREAM_KEY);
  assertEquals(read.anchor_accessions, ["0000320193-24-000123"]);
});

Deno.test("applySecFetchMetadataToSource persists parseable checkpoint", () => {
  const checkpoint = buildSecIntelCheckpoint({
    page0Accessions: ["0000320193-24-000100"],
    page0HeadUpdatedAt: "2024-01-01T12:00:00Z",
    pagesFetched: 1,
    nowIso: "2024-01-01T12:05:00Z",
    prior: null,
  });
  const source: SourceRecord = {
    id: "s",
    sourceKey: "sec",
    companyName: null,
    ticker: null,
    cik: null,
    sourceType: "SEC_FILINGS",
    url: "https://www.sec.gov/",
    hostname: "www.sec.gov",
    feedFormat: "sec_atom",
    pollIntervalSeconds: 180,
    enabled: true,
    priority: 1,
    evidenceTier: "TIER_1_PRIMARY",
    authorityKey: "sec",
    lastSuccessAt: null,
    lastContentHash: null,
    lastEtag: null,
    lastModified: null,
    failureCount: 0,
    backoffUntil: null,
    lastErrorCategory: null,
    metadata: {},
  };
  applySecFetchMetadataToSource(
    source,
    { checkpoint: { ...checkpoint }, continuation: null, batchComplete: true },
    "2024-01-02T12:00:00Z",
    "deadbeef",
    true,
  );
  const loaded = readSecIntelCheckpoint(source.metadata);
  assert(loaded);
  assertEquals(loaded.revision, 0);
});

Deno.test("buildSecIntelCheckpoint increments revision", () => {
  const prior = buildSecIntelCheckpoint({
    page0Accessions: ["0000320193-24-000100"],
    page0HeadUpdatedAt: "2024-01-01T12:00:00Z",
    pagesFetched: 1,
    nowIso: "2024-01-01T12:05:00Z",
    prior: null,
  });
  const next = buildSecIntelCheckpoint({
    page0Accessions: ["0000320193-24-000123"],
    page0HeadUpdatedAt: "2024-01-02T12:00:00Z",
    pagesFetched: 2,
    nowIso: "2024-01-02T12:05:00Z",
    prior,
  });
  assertEquals(next.revision, prior.revision + 1);
});
