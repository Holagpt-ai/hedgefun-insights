import { attributeCandidate } from "./attribution.ts";
import { classifyCandidate } from "./classification.ts";
import { findDuplicateEvent } from "./dedupe.ts";
import { evidenceRole } from "./evidence.ts";
import { assessMateriality, timingUrgency } from "./impact.ts";
import {
  advanceForAnnouncement,
  appendLifecycle,
  applyScheduleClock,
} from "./lifecycle.ts";
import { isFixturePayload } from "./normalize.ts";
import type { CatalystIntelStore } from "./persistence.ts";
import { catalystPriority } from "./scoring.ts";
import { normalizeTiming } from "./timing.ts";
import type {
  CanonicalEvent,
  CompanyRecord,
  EvidenceRecord,
  IngestOutcome,
  LifecycleLogEntry,
  NormalizedEventCandidate,
  SourceRecord,
} from "./types.ts";
import { verificationConfidence, verifyFromEvidence } from "./verification.ts";

export interface IngestContext {
  now: Date;
  allowFixtures: boolean;
  source: SourceRecord;
  companies?: readonly CompanyRecord[];
  cikMap?: ReadonlyMap<string, string[]>;
}

export async function ingestCandidate(
  store: CatalystIntelStore,
  candidate: NormalizedEventCandidate,
  ctx: IngestContext,
): Promise<IngestOutcome> {
  if (!candidate.title.trim()) return { status: "rejected", eventId: null, rawItemId: null };
  if (
    (isFixturePayload(candidate.metadata) ||
      isFixturePayload(candidate.raw.metadata) ||
      isFixturePayload(ctx.source.metadata)) &&
    !ctx.allowFixtures
  ) {
    return { status: "rejected", eventId: null, rawItemId: null };
  }

  const existingRaw = candidate.raw.externalId
    ? await store.findRawByExternal(candidate.raw.sourceId, candidate.raw.externalId)
    : null;
  const hashed = existingRaw ?? await store.findRawByHash(candidate.raw.sourceId, candidate.raw.contentHash);
  if (hashed) {
    const linked = await store.findEvidenceByRaw(hashed.id);
    return { status: "duplicate", eventId: linked?.eventId ?? null, rawItemId: hashed.id };
  }

  const rawId = crypto.randomUUID();
  await store.insertRaw({
    id: rawId,
    sourceId: candidate.raw.sourceId,
    externalId: candidate.raw.externalId,
    canonicalUrl: candidate.raw.canonicalUrl,
    contentHash: candidate.raw.contentHash,
    publishedAt: candidate.raw.publishedAt,
    discoveredAt: candidate.raw.discoveredAt,
    title: candidate.title,
    bodyExcerpt: candidate.summary,
    metadata: boundedMetadata(candidate.raw.metadata),
  });

  const attribution = attributeCandidate(candidate, {
    sourceTicker: ctx.source.ticker,
    sourceCompanyName: ctx.source.companyName,
    sourceCik: ctx.source.cik,
    sourceType: ctx.source.sourceType,
    cikMap: ctx.cikMap,
    companies: ctx.companies,
  });
  if (attribution.status !== "resolved" || !attribution.ticker || !attribution.relation) {
    return { status: "unresolved", eventId: null, rawItemId: rawId };
  }

  const classification = classifyCandidate(candidate);
  const timing = normalizeTiming(candidate, ctx.now);
  const pool = await loadPool(store, attribution.ticker, candidate.raw.canonicalUrl, candidate.raw.contentHash);
  const evidenceMap = new Map<string, EvidenceRecord[]>();
  for (const event of pool) evidenceMap.set(event.id, await store.listEvidence(event.id));
  const match = findDuplicateEvent({
    title: candidate.title,
    eventType: classification.eventType,
    ticker: attribution.ticker,
    scheduledStart: timing.scheduledStart,
    publishedAt: timing.publishedAt,
    canonicalUrl: candidate.raw.canonicalUrl,
    contentHash: candidate.raw.contentHash,
  }, pool, evidenceMap);

  const at = ctx.now.toISOString();
  let event: CanonicalEvent;
  let created = false;
  if (!match) {
    created = true;
    let lifecycle: CanonicalEvent["lifecycle"] = "discovered";
    const log: LifecycleLogEntry[] = [{ from: null, to: lifecycle, at, reason: "created" }];
    const clock = applyScheduleClock(lifecycle, timing, ctx.now);
    if (clock.lifecycle !== lifecycle) {
      log.push({ from: lifecycle, to: clock.lifecycle, at, reason: clock.reason ?? "schedule" });
      lifecycle = clock.lifecycle;
    }
    if (candidate.isAnnouncement) {
      const announced = advanceForAnnouncement(lifecycle);
      if (announced !== lifecycle) {
        log.push({ from: lifecycle, to: announced, at, reason: "announcement_evidence" });
        lifecycle = announced;
      }
    }
    event = {
      id: crypto.randomUUID(),
      canonicalKey: `ci:${attribution.ticker}:${classification.eventType}:${anchor(timing, candidate.raw.contentHash)}`,
      title: candidate.title,
      summary: candidate.summary,
      announcementSummary: candidate.isAnnouncement ? candidate.summary : null,
      eventType: classification.eventType,
      eventSubtype: classification.subtype,
      lifecycle,
      catalystState: "WATCH",
      firstDiscoveredAt: candidate.raw.discoveredAt,
      sourcePublishedAt: timing.publishedAt,
      scheduledStartAt: timing.scheduledStart,
      scheduledEndAt: timing.scheduledEnd,
      scheduledDate: timing.scheduledDate,
      announcementAt: candidate.isAnnouncement ? timing.publishedAt : null,
      effectiveAt: timing.effectiveAt,
      timingBucket: timing.bucket,
      verificationState: "UNVERIFIED",
      evidenceConfidence: 0,
      materiality: assessMateriality(classification),
      timingUrgency: 0,
      reactionScore: null,
      priorityScore: 0,
      attributionConfidence: attribution.confidence,
      distributionStatus: "observation",
      lifecycleLog: log.filter((entry) => entry.from !== entry.to),
      scoreComponents: { explicit_product_update: classification.explicitProductUpdate },
    };
    await store.insertEvent(event);
  } else {
    event = match;
    if (candidate.isAnnouncement) {
      const announced = advanceForAnnouncement(event.lifecycle);
      if (announced !== event.lifecycle) {
        event.lifecycleLog = appendLifecycle(event.lifecycleLog, event.lifecycle, announced, at, "announcement_evidence");
        event.lifecycle = announced;
      }
      event.announcementSummary = candidate.summary ?? event.announcementSummary;
      event.announcementAt = event.announcementAt ?? timing.publishedAt;
    }
    if (!event.scheduledStartAt && timing.scheduledStart) event.scheduledStartAt = timing.scheduledStart;
    if (!event.scheduledEndAt && timing.scheduledEnd) event.scheduledEndAt = timing.scheduledEnd;
    if (!event.scheduledDate && timing.scheduledDate) event.scheduledDate = timing.scheduledDate;
    const clock = applyScheduleClock(event.lifecycle, {
      scheduledStart: event.scheduledStartAt,
      scheduledEnd: event.scheduledEndAt,
      scheduledDate: event.scheduledDate,
    }, ctx.now);
    if (clock.lifecycle !== event.lifecycle) {
      event.lifecycleLog = appendLifecycle(event.lifecycleLog, event.lifecycle, clock.lifecycle, at, clock.reason ?? "schedule");
      event.lifecycle = clock.lifecycle;
    }
    event.materiality = Math.max(event.materiality, assessMateriality(classification));
    event.scoreComponents = {
      ...event.scoreComponents,
      explicit_product_update: Boolean(event.scoreComponents.explicit_product_update) || classification.explicitProductUpdate,
    };
    event.attributionConfidence = Math.max(event.attributionConfidence, attribution.confidence);
  }

  const evidenceRow: EvidenceRecord = {
    id: crypto.randomUUID(),
    eventId: event.id,
    rawItemId: rawId,
    sourceId: candidate.raw.sourceId,
    evidenceTier: candidate.evidenceTier,
    evidenceRole: evidenceRole(candidate.evidenceTier),
    canonicalUrl: candidate.raw.canonicalUrl,
    contentHash: candidate.raw.contentHash,
    publishedAt: candidate.raw.publishedAt,
    conflict: false,
  };
  await store.insertEvidence(evidenceRow);
  await store.upsertTicker({
    id: crypto.randomUUID(),
    eventId: event.id,
    ticker: attribution.ticker,
    relation: attribution.relation,
    confidence: attribution.confidence,
    isPrimary: true,
    evidenceNote: attribution.note,
  });

  const evidence = await store.listEvidence(event.id);
  applyScores(event, evidence, ctx.now);
  if (created) await store.updateEvent(event);
  else await store.updateEvent(event);
  return { status: created ? "created" : "updated", eventId: event.id, rawItemId: rawId };
}

export function applyScores(event: CanonicalEvent, evidence: readonly EvidenceRecord[], now: Date): void {
  const verification = verifyFromEvidence(evidence);
  event.verificationState = verification;
  event.evidenceConfidence = verificationConfidence(verification);
  event.timingUrgency = timingUrgency({
    bucket: event.timingBucket,
    lifecycle: event.lifecycle,
    scheduledStart: event.scheduledStartAt,
    scheduledDate: event.scheduledDate,
    now,
  });
  const scored = catalystPriority({
    evidenceConfidence: event.evidenceConfidence,
    materiality: event.materiality,
    timingUrgency: event.timingUrgency,
    attributionConfidence: event.attributionConfidence,
    reactionScore: event.reactionScore,
    verification,
    lifecycle: event.lifecycle,
  });
  event.priorityScore = scored.priority;
  event.catalystState = scored.state;
  event.scoreComponents = { ...event.scoreComponents, ...scored.components };
}

async function loadPool(
  store: CatalystIntelStore,
  ticker: string,
  url: string | null,
  contentHash: string,
): Promise<CanonicalEvent[]> {
  const byId = new Map<string, CanonicalEvent>();
  for (const event of await store.listEventsForTicker(ticker)) byId.set(event.id, event);
  const extra = [
    ...(url ? await store.evidenceForUrl(url) : []),
    ...await store.evidenceForHash(contentHash),
  ];
  for (const row of extra) {
    if (byId.has(row.eventId)) continue;
    const event = await store.getEvent(row.eventId);
    if (event) byId.set(event.id, event);
  }
  return [...byId.values()];
}

function anchor(timing: { scheduledStart: string | null; scheduledDate: string | null }, hash: string): string {
  if (timing.scheduledStart) return timing.scheduledStart.slice(0, 16);
  if (timing.scheduledDate) return timing.scheduledDate;
  return hash.slice(0, 12);
}

function boundedMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const text = JSON.stringify(metadata);
  if (text.length <= 8_000) return metadata;
  return { truncated: true };
}
