import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyIrEarningsDisposition, resolveIrIsAnnouncement } from "./ir-announcement-semantics.ts";
import { companyIrAdapter } from "./adapters/company-ir.ts";
import type { SourceRecord } from "./types.ts";

Deno.test("schedule-only calendar IR items are not announcements", () => {
  assertEquals(
    resolveIrIsAnnouncement("Investor Day — November 12, 2026", true),
    false,
  );
  assertEquals(
    resolveIrIsAnnouncement("Intuit Announces Date for Fourth Quarter Results on August 25, 2026", true),
    true,
  );
});

Deno.test("company IR normalize marks bare calendar slots as schedule-only", async () => {
  const src: SourceRecord = {
    id: crypto.randomUUID(),
    sourceKey: "test-ir",
    companyName: "Example Co",
    ticker: "EXM",
    cik: null,
    sourceType: "COMPANY_IR",
    url: "https://example.com/ir/rss",
    hostname: "example.com",
    feedFormat: "rss",
    pollIntervalSeconds: 600,
    enabled: true,
    priority: 50,
    evidenceTier: "TIER_1_PRIMARY",
    authorityKey: "example",
    lastSuccessAt: null,
    lastContentHash: null,
    lastEtag: null,
    lastModified: null,
    failureCount: 0,
    backoffUntil: null,
    lastErrorCategory: null,
    metadata: {},
  };
  const normalized = await companyIrAdapter.normalize!({
    sourceId: src.id,
    sourceType: "COMPANY_IR",
    externalId: "cal-1",
    canonicalUrl: "https://example.com/ir/cal-1",
    publishedAt: "2026-09-01T12:00:00.000Z",
    discoveredAt: "2026-10-01T12:00:00.000Z",
    title: "Investor Day — November 12, 2026",
    summary: null,
    contentHash: "hash-cal",
    metadata: { scheduledDate: "2026-11-12" },
  }, {
    now: new Date("2026-10-01T12:00:00.000Z"),
    source: src,
    userAgent: "test",
    fetchImpl: fetch,
    itemLimit: 10,
    allowFixtures: false,
    fetchState: {
      unchanged: false,
      etag: null,
      lastModified: null,
      contentHash: null,
      checkpoint: null,
    },
  });
  assert(normalized);
  assertEquals(normalized.isAnnouncement, false);
});

Deno.test("classifyIrEarningsDisposition separates schedule from reported results", () => {
  assertEquals(
    classifyIrEarningsDisposition("Intuit Announces Date for Fourth Quarter Results on August 25, 2026"),
    "schedule_announced",
  );
  assertEquals(
    classifyIrEarningsDisposition("Intuit Reports Fourth Quarter and Full Year 2026 Results"),
    "results_reported",
  );
  assertEquals(classifyIrEarningsDisposition("Product launch webinar"), null);
});
