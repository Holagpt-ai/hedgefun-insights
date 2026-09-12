/**
 * Pure PM Inbox selector for today's provider-reported catalyst activity.
 * Does not invent prices, outcomes, scores, priorities, or timestamps.
 */

import { canonicalUrl } from "@/lib/catalyst/attribution";
import { eventMomentMs, normalizeSymbol } from "@/lib/catalyst/parsers";
import type { CatalystEvent } from "@/types/catalyst";

export const PM_CATALYST_ACTIVITY_LIMIT = 6;
export const PM_CATALYST_ACTIVITY_CANDIDATE_LIMIT = 100;

/** America/New_York calendar date (YYYY-MM-DD) containing `nowMs`. */
export function etCalendarDate(nowMs: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(nowMs));
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function readTitle(event: CatalystEvent): string | null {
  if (typeof event.title !== "string") return null;
  const title = event.title.trim();
  return title.length > 0 ? title : null;
}

function rowIdentities(event: CatalystEvent): string[] {
  const identities: string[] = [];
  if (typeof event.id === "string" && event.id.trim()) {
    identities.push(`id:${event.id.trim()}`);
  }
  if (typeof event.dedupe_key === "string" && event.dedupe_key.trim()) {
    identities.push(`dedupe:${event.dedupe_key.trim()}`);
  }
  const url = canonicalUrl(event.source_url);
  if (url) identities.push(`url:${url}`);
  return identities;
}

type Ranked<T> = {
  row: T;
  index: number;
  moment: number;
  identities: string[];
};

export function selectPmCatalystActivity<T extends CatalystEvent>(
  events: T[],
  nowMs: number,
  limit = PM_CATALYST_ACTIVITY_LIMIT,
): T[] {
  if (!Array.isArray(events) || limit <= 0 || !Number.isFinite(nowMs)) return [];

  const todayEt = etCalendarDate(nowMs);
  const candidates: Ranked<T>[] = [];

  for (let index = 0; index < events.length; index += 1) {
    const row = events[index];
    if (!row || typeof row !== "object") continue;
    if (row.verification_state !== "provider_reported") continue;
    if (row.event_type === "earnings") continue;
    if (typeof row.event_date !== "string" || row.event_date !== todayEt) continue;
    if (!readTitle(row)) continue;
    if (!normalizeSymbol(row.symbol)) continue;

    candidates.push({
      row,
      index,
      moment: eventMomentMs(row) ?? Number.NEGATIVE_INFINITY,
      identities: rowIdentities(row),
    });
  }

  candidates.sort((a, b) => {
    if (b.moment !== a.moment) return b.moment - a.moment;
    return a.index - b.index;
  });

  const seen = new Set<string>();
  const selected: T[] = [];
  for (const candidate of candidates) {
    if (candidate.identities.some((key) => seen.has(key))) continue;
    for (const key of candidate.identities) seen.add(key);
    selected.push(candidate.row);
    if (selected.length >= limit) break;
  }
  return selected;
}
