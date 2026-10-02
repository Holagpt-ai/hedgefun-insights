import { LIVE_REACTION_MAX_AGE_MS } from "./config.ts";
import { eventReferenceInstant } from "./event-bars.ts";
import type { CatalystIntelStore } from "./persistence.ts";
import type { CanonicalEvent } from "./types.ts";

export type ReactionRunMode = "live" | "historical_backfill";

export interface HistoricalBackfillScope {
  eventIds?: string[];
  ticker?: string;
  /** Inclusive lower bound on event reference instant (ISO date or timestamp). */
  referenceNotBefore?: string;
  /** Inclusive upper bound on event reference instant (ISO date or timestamp). */
  referenceNotAfter?: string;
}

export function parseReactionRunMode(value: unknown): ReactionRunMode {
  return value === "historical_backfill" ? "historical_backfill" : "live";
}

export function parseHistoricalBackfillScope(body: Record<string, unknown>): HistoricalBackfillScope | null {
  const eventIds = stringList(body.event_ids);
  if (eventIds === null) return null;
  const ticker = typeof body.ticker === "string" && body.ticker.trim() ? body.ticker.trim().toUpperCase() : undefined;
  const referenceNotBefore = isoBound(body.reference_not_before);
  const referenceNotAfter = isoBound(body.reference_not_after);
  const scope: HistoricalBackfillScope = {
    eventIds: eventIds.length > 0 ? eventIds : undefined,
    ticker,
    referenceNotBefore,
    referenceNotAfter,
  };
  return validateHistoricalBackfillScope(scope) ? scope : null;
}

export function validateHistoricalBackfillScope(scope: HistoricalBackfillScope): boolean {
  if (scope.eventIds && scope.eventIds.length > 0) return true;
  if (scope.ticker && (scope.referenceNotBefore || scope.referenceNotAfter)) return true;
  return false;
}

function stringList(value: unknown): string[] | null {
  if (value == null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) return null;
  return (value as string[]).map((id) => id.trim()).filter(Boolean);
}

function isoBound(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const ms = Date.parse(value.trim());
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms).toISOString();
}

export function reactionReferenceAgeMs(event: CanonicalEvent, now: Date): number | null {
  const ref = eventReferenceInstant(event);
  if (!ref) return null;
  const refMs = Date.parse(ref);
  if (!Number.isFinite(refMs)) return null;
  return now.getTime() - refMs;
}

/**
 * LIVE mode: monitor current market reaction using event reference time, not discovery time.
 * Active live/reacting lifecycles remain eligible while not future-blocked.
 */
export function isLiveReactionEligible(
  event: CanonicalEvent,
  now: Date,
  maxAgeMs = LIVE_REACTION_MAX_AGE_MS,
): boolean {
  if (event.lifecycle === "live" || event.lifecycle === "reacting") return true;
  const ageMs = reactionReferenceAgeMs(event, now);
  if (ageMs == null) return false;
  if (ageMs < 0) return false;
  return ageMs <= maxAgeMs;
}

export function matchesReferenceWindow(
  event: CanonicalEvent,
  scope: HistoricalBackfillScope,
): boolean {
  const ref = eventReferenceInstant(event);
  if (!ref) return false;
  const ms = Date.parse(ref);
  if (!Number.isFinite(ms)) return false;
  if (scope.referenceNotBefore) {
    const low = Date.parse(scope.referenceNotBefore);
    if (Number.isFinite(low) && ms < low) return false;
  }
  if (scope.referenceNotAfter) {
    const high = Date.parse(scope.referenceNotAfter);
    if (Number.isFinite(high) && ms > high) return false;
  }
  if (scope.ticker) {
    return true;
  }
  return true;
}

export async function loadHistoricalBackfillCandidates(
  store: CatalystIntelStore,
  scope: HistoricalBackfillScope,
  limit: number,
): Promise<CanonicalEvent[]> {
  const cap = Math.min(Math.max(1, limit), 200);
  let pool: CanonicalEvent[] = [];
  if (scope.eventIds?.length) {
    for (const id of scope.eventIds) {
      if (pool.length >= cap * 3) break;
      const event = await store.getEvent(id);
      if (event) pool.push(event);
    }
  } else if (scope.ticker) {
    pool = await store.listEventsForTicker(scope.ticker);
  }
  if (scope.ticker) {
    const ticker = scope.ticker;
    const filtered: CanonicalEvent[] = [];
    for (const event of pool) {
      const links = await store.listTickers(event.id);
      const primary = links.find((row) => row.isPrimary) ?? links[0];
      if (!primary || primary.ticker.toUpperCase() !== ticker) continue;
      filtered.push(event);
    }
    pool = filtered;
  }
  return pool
    .filter((event) => matchesReferenceWindow(event, scope))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, cap);
}
