import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { findDuplicateEvent } from "./dedupe.ts";
import type { CanonicalEvent, EvidenceRecord } from "./types.ts";

function event(id: string, eventType: CanonicalEvent["eventType"] = "SEC_FILING"): CanonicalEvent {
  return {
    id,
    canonicalKey: `ci:TEST:${eventType}:a`,
    title: "Example filed Form 8-K",
    summary: null,
    announcementSummary: null,
    eventType,
    eventSubtype: "8-K",
    lifecycle: "discovered",
    catalystState: "WATCH",
    firstDiscoveredAt: "2026-01-01T00:00:00.000Z",
    sourcePublishedAt: "2026-01-01T00:00:00.000Z",
    scheduledStartAt: null,
    scheduledEndAt: null,
    scheduledDate: null,
    announcementAt: null,
    effectiveAt: null,
    timingBucket: "unknown",
    verificationState: "UNVERIFIED",
    evidenceConfidence: 0,
    materiality: 40,
    timingUrgency: 0,
    reactionScore: null,
    priorityScore: 0,
    attributionConfidence: 0.9,
    distributionStatus: "observation",
    lifecycleLog: [],
    scoreComponents: {},
  };
}

Deno.test("findDuplicateEvent merges SEC filings sharing accession in canonical URL", () => {
  const existing = event("evt-1");
  const evidence: EvidenceRecord[] = [{
    id: "ev-1",
    eventId: "evt-1",
    rawItemId: "raw-1",
    sourceId: "src-1",
    authorityKey: "sec",
    evidenceTier: "TIER_1_PRIMARY",
    evidenceRole: "primary",
    canonicalUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/xslF345X03/form8-k.htm",
    contentHash: "hash-a",
    publishedAt: "2026-01-01T00:00:00.000Z",
    conflict: false,
  }];
  const map = new Map([["evt-1", evidence]]);
  const match = findDuplicateEvent({
    title: "Example filed Form 8-K",
    eventType: "SEC_FILING",
    ticker: "TEST",
    scheduledStart: null,
    publishedAt: "2026-01-02T00:00:00.000Z",
    canonicalUrl: "https://www.sec.gov/Archives/edgar/data/320193/000032019324000123/form8-k.htm",
    contentHash: "hash-b",
    accessionNumber: "0000320193-24-000123",
  }, [existing], map);
  assertEquals(match?.id, "evt-1");
});
