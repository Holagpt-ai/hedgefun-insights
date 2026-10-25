import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { earningsDedupeKey } from "../catalyst/contract.ts";
import {
  evaluateIntelDistributionBundle,
  resolveIntelDistributionWriteMode,
  runIntelDistributionBatch,
  type IntelDistributionBundle,
} from "./distribution-bridge.ts";
import { assessIntelDistributionEligibility } from "./distribution-eligibility.ts";
import {
  assessPublicFeedCollision,
  intelDistributionDedupeKey,
  projectIntelToPublicCatalystRow,
} from "./distribution-projection.ts";
import type { CanonicalEvent, EvidenceRecord, TickerLink } from "./types.ts";

const NOW = new Date("2026-10-26T14:00:00.000Z");

function baseEvent(partial: Partial<CanonicalEvent> = {}): CanonicalEvent {
  return {
    id: partial.id ?? "evt-primary-1",
    canonicalKey: partial.canonicalKey ?? "canon-1",
    title: partial.title ?? "Acme announces major contract win",
    summary: partial.summary ?? null,
    announcementSummary: partial.announcementSummary ?? "Acme Corp signed a material contract.",
    eventType: partial.eventType ?? "CONTRACT",
    eventSubtype: partial.eventSubtype ?? null,
    lifecycle: partial.lifecycle ?? "announced",
    catalystState: partial.catalystState ?? "IMMEDIATE",
    firstDiscoveredAt: partial.firstDiscoveredAt ?? "2026-10-26T13:00:00.000Z",
    sourcePublishedAt:
      partial.sourcePublishedAt !== undefined ? partial.sourcePublishedAt : "2026-10-26T13:00:00.000Z",
    scheduledStartAt: partial.scheduledStartAt ?? null,
    scheduledEndAt: partial.scheduledEndAt ?? null,
    scheduledDate: partial.scheduledDate ?? null,
    announcementAt:
      partial.announcementAt !== undefined ? partial.announcementAt : "2026-10-26T13:00:00.000Z",
    effectiveAt: partial.effectiveAt ?? null,
    timingBucket: partial.timingBucket ?? "regular_session",
    verificationState: partial.verificationState ?? "VERIFIED_PRIMARY",
    evidenceConfidence: partial.evidenceConfidence ?? 95,
    materiality: partial.materiality ?? 80,
    timingUrgency: partial.timingUrgency ?? 70,
    reactionScore: partial.reactionScore ?? null,
    priorityScore: partial.priorityScore ?? 75,
    attributionConfidence: partial.attributionConfidence ?? 90,
    distributionStatus: partial.distributionStatus ?? "ready",
    lifecycleLog: partial.lifecycleLog ?? [],
    scoreComponents: partial.scoreComponents ?? {},
  };
}

function tickers(symbol = "ACME"): TickerLink[] {
  return [{
    id: "t1",
    eventId: "evt-primary-1",
    ticker: symbol,
    relation: "PRIMARY",
    confidence: 95,
    isPrimary: true,
    evidenceNote: null,
  }];
}

function evidence(partial: Partial<EvidenceRecord> = {}): EvidenceRecord[] {
  return [{
    id: "e1",
    eventId: "evt-primary-1",
    rawItemId: "r1",
    sourceId: "s1",
    authorityKey: partial.authorityKey ?? "acme-ir",
    evidenceTier: partial.evidenceTier ?? "TIER_1_PRIMARY",
    evidenceRole: "primary",
    canonicalUrl: partial.canonicalUrl ?? "https://ir.acme.test/news/contract",
    contentHash: "hash",
    publishedAt: partial.publishedAt ?? "2026-10-26T13:00:00.000Z",
    conflict: partial.conflict ?? false,
  }];
}

function bundle(partial: {
  event?: Partial<CanonicalEvent>;
  evidence?: EvidenceRecord[];
  persistMetadata?: Record<string, unknown>;
} = {}): IntelDistributionBundle {
  return {
    event: baseEvent(partial.event),
    tickers: tickers(),
    evidence: partial.evidence ?? evidence(),
    persistMetadata: partial.persistMetadata,
  };
}

Deno.test("Batch 176 — verified primary projects with intel namespace and facts", () => {
  const projected = projectIntelToPublicCatalystRow(bundle());
  assertEquals(projected.rejectReason, null);
  const row = projected.row!;
  assertEquals(row.dedupe_key, intelDistributionDedupeKey("evt-primary-1"));
  assertEquals(row.verification_state, "provider_reported");
  assertEquals(row.facts.intel_verification, "VERIFIED_PRIMARY");
  assertEquals(row.facts.attribution_class, "direct");
  assertEquals(row.source_url, "https://ir.acme.test/news/contract");
  assertEquals(row.published_at, "2026-10-26T13:00:00.000Z");
});

Deno.test("Batch 176 — multi-source verification stays in facts not DB verification_state", () => {
  const projected = projectIntelToPublicCatalystRow(bundle({
    event: { verificationState: "VERIFIED_MULTI_SOURCE" },
    evidence: [
      ...evidence({ authorityKey: "publisher-a" }),
      {
        ...evidence({ authorityKey: "publisher-b" })[0],
        id: "e2",
        evidenceRole: "secondary",
        evidenceTier: "TIER_2_STRONG_SECONDARY",
      },
    ],
  }));
  assertEquals(projected.row!.verification_state, "provider_reported");
  assertEquals(projected.row!.facts.intel_verification, "VERIFIED_MULTI_SOURCE");
});

Deno.test("Batch 176 — schedule-only earnings rejected", () => {
  const result = assessIntelDistributionEligibility({
    event: baseEvent({
      eventType: "EARNINGS",
      lifecycle: "scheduled",
      scheduledDate: "2026-11-15",
      sourcePublishedAt: null,
      announcementAt: null,
    }),
    tickers: tickers(),
    evidence: evidence(),
    persistMetadata: { earnings_disposition: "schedule_announced" },
    now: NOW,
  });
  assertEquals(result.eligible, false);
  assertEquals(result.rejectCode, "schedule_only_calendar");
});

Deno.test("Batch 176 — announced lifecycle with schedule_announced metadata still rejected", () => {
  const result = assessIntelDistributionEligibility({
    event: baseEvent({
      eventType: "EARNINGS",
      lifecycle: "announced",
      sourcePublishedAt: "2026-10-26T13:00:00.000Z",
      announcementAt: "2026-10-26T13:00:00.000Z",
    }),
    tickers: tickers(),
    evidence: evidence(),
    persistMetadata: { earnings_disposition: "schedule_announced" },
    now: NOW,
  });
  assertEquals(result.eligible, false);
  assertEquals(result.detail, "earnings_schedule_announced");
});

Deno.test("Batch 176 — earnings results reported eligible when qualified", () => {
  const result = assessIntelDistributionEligibility({
    event: baseEvent({
      eventType: "EARNINGS",
      lifecycle: "announced",
      title: "Acme reports Q3 earnings results",
    }),
    tickers: tickers(),
    evidence: evidence(),
    persistMetadata: { earnings_disposition: "results_reported" },
    now: NOW,
  });
  assertEquals(result.eligible, true);
});

Deno.test("Batch 176 — conflicting attribution rejected", () => {
  const result = assessIntelDistributionEligibility({
    event: baseEvent({ verificationState: "CONFLICTING" }),
    tickers: tickers(),
    evidence: evidence({ conflict: true }),
    now: NOW,
  });
  assertEquals(result.eligible, false);
  assertEquals(result.rejectCode, "conflicting_verification");
});

Deno.test("Batch 176 — invalidated lifecycle rejected", () => {
  const result = assessIntelDistributionEligibility({
    event: baseEvent({ lifecycle: "invalidated", verificationState: "INVALIDATED" }),
    tickers: tickers(),
    evidence: evidence(),
    now: NOW,
  });
  assertEquals(result.eligible, false);
  assertEquals(result.rejectCode, "invalidated_lifecycle");
});

Deno.test("Batch 176 — SEC exact accession match skips intel", () => {
  const accession = "0000123456-26-000001";
  const projected = projectIntelToPublicCatalystRow(bundle({
    event: { eventType: "SEC_FILING" },
    persistMetadata: { accession },
  }));
  const collision = assessPublicFeedCollision({
    projected: projected.row!,
    existingDedupeKeys: new Set([`sec:${accession}:ACME`]),
    persistMetadata: { accession },
  });
  assertEquals(collision.action, "skip_intel_preserve_existing");
  assertEquals(collision.reason, "sec_feed_exact_match");
});

Deno.test("Batch 176 — SEC different filing does not false-positive", () => {
  const projected = projectIntelToPublicCatalystRow(bundle({
    event: { eventType: "SEC_FILING" },
    persistMetadata: { accession: "0000123456-26-000002" },
  }));
  const collision = assessPublicFeedCollision({
    projected: projected.row!,
    existingDedupeKeys: new Set(["sec:0000123456-26-000001:ACME"]),
    persistMetadata: { accession: "0000123456-26-000002" },
  });
  assertEquals(collision.action, "allow_upsert");
});

Deno.test("Batch 176 — SEC without accession fails closed", () => {
  const projected = projectIntelToPublicCatalystRow(bundle({
    event: { eventType: "SEC_FILING" },
  }));
  const collision = assessPublicFeedCollision({
    projected: projected.row!,
    existingDedupeKeys: new Set(["sec:0000123456-26-000001:ACME"]),
  });
  assertEquals(collision.action, "reject_intel_ambiguous_sec");
});

Deno.test("Batch 176 — earnings calendar collision only for earnings rows", () => {
  const projected = projectIntelToPublicCatalystRow(bundle({ event: { eventType: "EARNINGS" } }));
  const key = earningsDedupeKey("ACME", projected.row!.event_date);
  const collision = assessPublicFeedCollision({
    projected: projected.row!,
    existingDedupeKeys: new Set([key]),
  });
  assertEquals(collision.action, "skip_intel_preserve_existing");
});

Deno.test("Batch 176 — contract on earnings date allowed when calendar key exists", () => {
  const projected = projectIntelToPublicCatalystRow(bundle({ event: { eventType: "CONTRACT" } }));
  const key = earningsDedupeKey("ACME", projected.row!.event_date);
  const collision = assessPublicFeedCollision({
    projected: projected.row!,
    existingDedupeKeys: new Set([key]),
  });
  assertEquals(collision.action, "allow_upsert");
});

Deno.test("Batch 176 — secondary-only ticker list rejected", () => {
  const result = assessIntelDistributionEligibility({
    event: baseEvent(),
    tickers: [{
      id: "t1",
      eventId: "evt-primary-1",
      ticker: "ACME",
      relation: "MENTION",
      confidence: 40,
      isPrimary: false,
      evidenceNote: null,
    }],
    evidence: evidence(),
    now: NOW,
  });
  assertEquals(result.eligible, false);
  assertEquals(result.rejectCode, "unresolved_ticker");
});

Deno.test("Batch 176 — repeated idempotent intel key allows upsert path", () => {
  const b = bundle();
  const first = evaluateIntelDistributionBundle(b, { now: NOW, existingPublicDedupeKeys: new Set() });
  const key = intelDistributionDedupeKey("evt-primary-1");
  const second = evaluateIntelDistributionBundle(b, { now: NOW, existingPublicDedupeKeys: new Set([key]) });
  assertEquals(first.status, "projected");
  assertEquals(second.status, "projected");
});

Deno.test("Batch 176 — default-disabled write mode", () => {
  assertEquals(resolveIntelDistributionWriteMode({ operatorAuthorized: false }), "dry_run");
  assertEquals(resolveIntelDistributionWriteMode({ operatorAuthorized: true, enableWrites: false }), "dry_run");
  assertEquals(resolveIntelDistributionWriteMode({ operatorAuthorized: true, enableWrites: true }), "blocked");
});

Deno.test("Batch 176 — upsert marked only after callback succeeds", async () => {
  let upsertCalls = 0;
  const prev = Deno.env.get("CATALYST_INTEL_DISTRIBUTION_WRITES_ENABLED");
  Deno.env.set("CATALYST_INTEL_DISTRIBUTION_WRITES_ENABLED", "true");
  try {
    const result = await runIntelDistributionBatch({
      bundles: [bundle()],
      now: NOW,
      authorization: { operatorAuthorized: true, enableWrites: true },
      upsert: async (rows) => {
        upsertCalls += 1;
        assertEquals(rows.length, 1);
        return 1;
      },
    });
    assertEquals(result.mode, "write");
    assertEquals(upsertCalls, 1);
    assertEquals(result.summary.upserted, 1);
    assertEquals(result.items[0]?.status, "upserted");
  } finally {
    if (prev === undefined) Deno.env.delete("CATALYST_INTEL_DISTRIBUTION_WRITES_ENABLED");
    else Deno.env.set("CATALYST_INTEL_DISTRIBUTION_WRITES_ENABLED", prev);
  }
});

Deno.test("Batch 176 — dry-run batch never upserts", async () => {
  let writes = 0;
  const result = await runIntelDistributionBatch({
    bundles: [bundle()],
    now: NOW,
    authorization: { operatorAuthorized: false },
    upsert: async () => {
      writes += 1;
      return 1;
    },
  });
  assertEquals(result.mode, "dry_run");
  assertEquals(writes, 0);
  assertEquals(result.summary.projected, 1);
  assertEquals(result.items[0]?.status, "dry_run");
});
