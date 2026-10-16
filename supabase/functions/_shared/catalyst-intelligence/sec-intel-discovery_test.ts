import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildSecIntelCheckpoint,
  readSecIntelCheckpoint,
} from "./sec-intel-discovery.ts";
import { SEC_EDGAR_STREAM_KEY } from "../sec-edgar/checkpoint.ts";

Deno.test("readSecIntelCheckpoint accepts sec_edgar_intel metadata", () => {
  const checkpoint = buildSecIntelCheckpoint({
    page0Accessions: ["0000320193-24-000123"],
    page0HeadUpdatedAt: "2024-01-02T12:00:00Z",
    pagesFetched: 1,
    nowIso: "2024-01-02T12:05:00Z",
    prior: null,
  });
  const read = readSecIntelCheckpoint({ sec_edgar_intel: checkpoint });
  assert(read);
  assertEquals(read.stream_key, SEC_EDGAR_STREAM_KEY);
  assertEquals(read.anchor_accessions, ["0000320193-24-000123"]);
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
