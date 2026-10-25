import { describe, expect, it } from "vitest";
import { assessIntelDistributionEligibility } from "@/lib/catalyst/intel-distribution-eligibility";
import {
  assessPublicFeedCollision,
  intelDistributionDedupeKey,
  projectIntelToPublicCatalystRow,
} from "@/lib/catalyst/intel-distribution-projection";
import type { CanonicalEventLike } from "@/lib/catalyst/intel-distribution-types";

const NOW = new Date("2026-10-26T14:00:00.000Z");

function event(partial: Partial<CanonicalEventLike> = {}): CanonicalEventLike {
  return {
    id: "evt-1",
    canonicalKey: "ck-1",
    title: "Test announcement",
    summary: null,
    announcementSummary: "Details",
    eventType: "CONTRACT",
    eventSubtype: null,
    lifecycle: "announced",
    sourcePublishedAt: "2026-10-26T13:00:00.000Z",
    scheduledStartAt: null,
    scheduledDate: null,
    announcementAt: "2026-10-26T13:00:00.000Z",
    firstDiscoveredAt: "2026-10-26T12:00:00.000Z",
    verificationState: "VERIFIED_PRIMARY",
    materiality: 70,
    distributionStatus: "ready",
    ...partial,
  };
}

describe("Batch 176 — intel distribution bridge (client mirror)", () => {
  it("rejects observation-only distribution status", () => {
    const result = assessIntelDistributionEligibility({
      event: event({ distributionStatus: "observation" }),
      tickers: [{ ticker: "AAA", isPrimary: true }],
      evidence: [{
        evidenceRole: "primary",
        canonicalUrl: "https://example.test/a",
        publishedAt: "2026-10-26T13:00:00.000Z",
        authorityKey: "src",
        conflict: false,
      }],
      now: NOW,
    });
    expect(result.eligible).toBe(false);
    expect(result.rejectCode).toBe("distribution_observation_only");
  });

  it("preserves intel verification in facts while DB state stays provider_reported", () => {
    const projected = projectIntelToPublicCatalystRow({
      event: event({ verificationState: "VERIFIED_MULTI_SOURCE" }),
      tickers: [{ ticker: "AAA", isPrimary: true }],
      evidence: [{
        evidenceRole: "primary",
        canonicalUrl: "https://example.test/a",
        publishedAt: "2026-10-26T13:00:00.000Z",
        authorityKey: "src",
        conflict: false,
      }],
    });
    expect(projected.row?.verification_state).toBe("provider_reported");
    expect(projected.row?.facts.intel_verification).toBe("VERIFIED_MULTI_SOURCE");
    expect(projected.row?.dedupe_key).toBe(intelDistributionDedupeKey("evt-1"));
  });

  it("skips intel when earnings calendar key exists for earnings rows only", () => {
    const projected = projectIntelToPublicCatalystRow({
      event: event({ eventType: "EARNINGS" }),
      tickers: [{ ticker: "AAA", isPrimary: true, relation: "PRIMARY" }],
      evidence: [{
        evidenceRole: "primary",
        canonicalUrl: "https://example.test/a",
        publishedAt: "2026-10-26T13:00:00.000Z",
        authorityKey: "src",
        conflict: false,
      }],
    });
    const date = projected.row!.event_date;
    const collision = assessPublicFeedCollision({
      projected: projected.row!,
      existingDedupeKeys: new Set([`earnings:AAA:${date}`]),
    });
    expect(collision.action).toBe("skip_intel_preserve_existing");
  });

  it("allows contract row when earnings calendar key exists same date", () => {
    const projected = projectIntelToPublicCatalystRow({
      event: event({ eventType: "CONTRACT" }),
      tickers: [{ ticker: "AAA", isPrimary: true, relation: "PRIMARY" }],
      evidence: [{
        evidenceRole: "primary",
        canonicalUrl: "https://example.test/a",
        publishedAt: "2026-10-26T13:00:00.000Z",
        authorityKey: "src",
        conflict: false,
      }],
    });
    const collision = assessPublicFeedCollision({
      projected: projected.row!,
      existingDedupeKeys: new Set([`earnings:AAA:${projected.row!.event_date}`]),
    });
    expect(collision.action).toBe("allow_upsert");
  });

  it("rejects schedule_announced even with announced lifecycle", () => {
    const result = assessIntelDistributionEligibility({
      event: event({ eventType: "EARNINGS", lifecycle: "announced" }),
      tickers: [{ ticker: "AAA", isPrimary: true, relation: "PRIMARY" }],
      evidence: [{
        evidenceRole: "primary",
        canonicalUrl: "https://example.test/a",
        publishedAt: "2026-10-26T13:00:00.000Z",
        authorityKey: "src",
        conflict: false,
      }],
      persistMetadata: { earnings_disposition: "schedule_announced" },
      now: NOW,
    });
    expect(result.eligible).toBe(false);
    expect(result.detail).toBe("earnings_schedule_announced");
  });
});
