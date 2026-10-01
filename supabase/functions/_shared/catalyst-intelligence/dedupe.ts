import { eventFamilyKey, sameEventFamily } from "./classification.ts";
import { jaccard, titleTokens } from "./normalize.ts";
import type { CanonicalEvent, EvidenceRecord, IntelEventType } from "./types.ts";

export interface DedupeCandidate {
  title: string;
  eventType: IntelEventType;
  ticker: string | null;
  scheduledStart: string | null;
  publishedAt: string | null;
  canonicalUrl: string | null;
  contentHash: string;
}

/**
 * Lock scope for concurrent creators of one logical event.
 * Ticker and event family only. Content hash, source, and UTC day are absent
 * so a report that crosses midnight still shares one lock.
 */
export function logicalEventLockKey(input: {
  ticker: string;
  eventType: IntelEventType;
}): string {
  return `evt:${input.ticker}:${eventFamilyKey(input.eventType)}`;
}

const TITLE_SYNDICATION = 0.72;
const TITLE_ENRICHMENT = 0.45;
const SCHEDULE_MS = 36 * 60 * 60 * 1000;
const CONFLICT_MS = 48 * 60 * 60 * 1000;
const PUBLISH_MS = 24 * 60 * 60 * 1000;

function close(a: string | null, b: string | null, windowMs: number): boolean {
  if (!a || !b) return false;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) <= windowMs;
}

function scheduleConflict(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return Math.abs(left - right) > CONFLICT_MS;
}

/**
 * Deterministic V1 dedupe.
 * Same company and same calendar day is not sufficient to merge.
 */
export function findDuplicateEvent(
  candidate: DedupeCandidate,
  events: readonly CanonicalEvent[],
  evidenceByEvent: ReadonlyMap<string, readonly EvidenceRecord[]>,
): CanonicalEvent | null {
  for (const event of events) {
    const evidence = evidenceByEvent.get(event.id) ?? [];
    if (candidate.canonicalUrl && evidence.some((row) => row.canonicalUrl === candidate.canonicalUrl)) {
      return event;
    }
    if (evidence.some((row) => row.contentHash === candidate.contentHash)) return event;
  }

  if (!candidate.ticker) return null;
  const tokens = titleTokens(candidate.title);
  for (const event of events) {
    if (scheduleConflict(candidate.scheduledStart, event.scheduledStartAt)) continue;
    if (candidate.eventType === "SEC_FILING" || event.eventType === "SEC_FILING") continue;
    const overlap = jaccard(tokens, titleTokens(event.title));
    const family = sameEventFamily(candidate.eventType, event.eventType);
    const publishedClose = close(candidate.publishedAt, event.sourcePublishedAt, PUBLISH_MS) ||
      close(candidate.publishedAt, event.announcementAt, PUBLISH_MS) ||
      close(candidate.publishedAt, event.firstDiscoveredAt, PUBLISH_MS);
    if (overlap >= TITLE_SYNDICATION && publishedClose) return event;
    if (!family) continue;
    if (close(candidate.scheduledStart, event.scheduledStartAt, SCHEDULE_MS)) return event;
    if (overlap >= TITLE_ENRICHMENT && (event.scheduledStartAt || candidate.scheduledStart || publishedClose)) {
      return event;
    }
  }
  return null;
}
