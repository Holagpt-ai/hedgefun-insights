/**
 * Secondary event urgency. This does not replace Radar volume-first ranking
 * or Day Trade opportunity scoring.
 *
 * Ordering impact, applied only by the Morning Opportunity Board:
 *  1. Volume dominance. When both session volumes are known and one is at
 *     least VOLUME_KING_DOMINANCE_RATIO times the other, the higher-volume
 *     name wins. Event type, catalyst, and stacking cannot override that.
 *  2. Inside that band, event urgency sorts next. VOLUME_EXPLOSION and
 *     RUNNING_UP are the strongest signals. Additional distinct events add
 *     a capped stack bonus. HOD momentum counts only as an event that
 *     already required participation in the detector.
 *  3. Catalyst adds a small bonus inside the band. It does not apply when
 *     volume dominance already decided the pair, and it does not apply to
 *     names below the scanner share floor.
 *  4. Session volume, then symbol, break remaining ties.
 *  5. A missing volume never outranks a known positive volume.
 *  6. Names below SCANNER_EVENT_MIN_SESSION_VOLUME get urgency 0 unless
 *     they are an already-qualified continuation handoff.
 */

import {
  INTELLIGENCE_EVENT_TYPES,
  SCANNER_EVENT_MIN_SESSION_VOLUME,
  canonicalIntelligenceEventType,
  type IntelligenceEventType,
} from "@/lib/scanner-intelligence/event-model";

export const VOLUME_KING_DOMINANCE_RATIO = 3;

export const EVENT_URGENCY_POINTS: Record<IntelligenceEventType, number> = {
  VOLUME_EXPLOSION: 40,
  RUNNING_UP: 32,
  VOLUME_ACCELERATION: 22,
  HOD_BREAK: 20,
  HOD_MOMENTUM: 18,
  GAP_CONTINUATION: 16,
  LATE_DAY_ACCELERATION: 14,
  VWAP_RECLAIM: 12,
  VWAP_LOSS: 4,
};

export const EVENT_STACK_BONUS = 6;
export const EVENT_STACK_BONUS_CAP = 12;
export const CATALYST_URGENCY_BONUS = 4;

export type EventUrgencySubject = {
  symbol: string;
  volume: number | null;
  events: readonly string[];
  catalystPresent: boolean | null;
  /** Already-qualified continuation handoffs keep their category urgency. */
  continuationUrgency?: number;
};

function finiteVolume(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null;
  return value;
}

export function distinctIntelligenceEvents(events: readonly string[]): IntelligenceEventType[] {
  const seen = new Set<IntelligenceEventType>();
  for (const event of events) {
    const type = canonicalIntelligenceEventType(event);
    if (type) seen.add(type);
  }
  return INTELLIGENCE_EVENT_TYPES.filter((type) => seen.has(type));
}

export function eventUrgencyScore(subject: EventUrgencySubject): number {
  const volume = finiteVolume(subject.volume);
  const continuation = subject.continuationUrgency ?? 0;
  const belowFloor = volume !== null && volume < SCANNER_EVENT_MIN_SESSION_VOLUME;
  if (belowFloor && continuation <= 0) return 0;

  const types = distinctIntelligenceEvents(subject.events);
  let best = 0;
  for (const type of types) {
    best = Math.max(best, EVENT_URGENCY_POINTS[type]);
  }
  const extra = Math.max(0, types.length - (best > 0 ? 1 : 0));
  const stack = Math.min(EVENT_STACK_BONUS_CAP, extra * EVENT_STACK_BONUS);
  const catalyst = subject.catalystPresent === true ? CATALYST_URGENCY_BONUS : 0;
  return best + stack + catalyst + continuation;
}

function volumeDominates(higher: number, lower: number): boolean {
  if (!(higher > lower)) return false;
  if (lower === 0) return higher > 0;
  return higher / lower >= VOLUME_KING_DOMINANCE_RATIO;
}

export function compareEventUrgency(a: EventUrgencySubject, b: EventUrgencySubject): number {
  const aVol = finiteVolume(a.volume);
  const bVol = finiteVolume(b.volume);

  if (aVol !== null && bVol !== null) {
    if (volumeDominates(aVol, bVol)) return -1;
    if (volumeDominates(bVol, aVol)) return 1;
  } else if (aVol !== null && aVol > 0 && bVol === null) {
    return -1;
  } else if (bVol !== null && bVol > 0 && aVol === null) {
    return 1;
  }

  const urgency = eventUrgencyScore(b) - eventUrgencyScore(a);
  if (urgency !== 0) return urgency;

  if (aVol !== null && bVol !== null && aVol !== bVol) return bVol - aVol;
  return a.symbol.localeCompare(b.symbol);
}
