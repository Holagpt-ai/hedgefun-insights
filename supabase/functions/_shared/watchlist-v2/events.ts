// Map Finnhub company-news items to RecentEvent[] with per-ticker deduplication.
// Optional-provider failures degrade to empty [] with the corresponding quality code.

import type { RecentEvent } from "./contract.ts";
import { sanitize } from "./sanitize.ts";

export interface MapNewsResult {
  events: RecentEvent[];
  quality: "ok" | "missing" | "none_qualifying";
}

function isNonEmptyStr(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * @param rawArticles - Raw Finnhub /company-news array or null on transport failure.
 * @param now - Current instant; used for a 24h look-back window.
 * @param analyzedAtIso - ISO string stamped as ingested_at.
 */
export function mapNewsEvents(
  rawArticles: unknown,
  now: Date,
  analyzedAtIso: string,
): MapNewsResult {
  if (rawArticles === null) return { events: [], quality: "missing" };
  if (!Array.isArray(rawArticles)) return { events: [], quality: "missing" };
  const nowMs = now.getTime();
  const cutoff = nowMs - 24 * 60 * 60 * 1000;

  const dedup = new Map<string, RecentEvent>();
  for (const raw of rawArticles) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const headline = r.headline;
    if (!isNonEmptyStr(headline)) continue;
    // dt: unix seconds
    const dt = r.datetime;
    if (typeof dt !== "number" || !Number.isFinite(dt)) continue;
    const ms = Math.round(dt * 1000);
    if (ms < cutoff || ms > nowMs) continue;

    const source = isNonEmptyStr(r.source) ? r.source : "Unknown source";
    const urlRaw = r.url;
    const url = isNonEmptyStr(urlRaw) && urlRaw.startsWith("https://") ? urlRaw : null;
    const id = isNonEmptyStr(r.id) ? r.id : sanitize(headline).slice(0, 40) + ":" + ms;

    const key = `${(headline as string).toLowerCase()}|${source.toLowerCase()}`;
    const existing = dedup.get(key);
    if (existing) {
      // Keep newer
      if (Date.parse(existing.event_time) < ms) {
        dedup.set(key, {
          event_id: String(id),
          event_type: "news",
          title: truncate(headline as string, 300),
          event_time: new Date(ms).toISOString(),
          source_name: source,
          source_url: url,
          verification_state: "provider_reported",
          ingested_at: analyzedAtIso,
        });
      }
    } else {
      dedup.set(key, {
        event_id: String(id),
        event_type: "news",
        title: truncate(headline as string, 300),
        event_time: new Date(ms).toISOString(),
        source_name: source,
        source_url: url,
        verification_state: "provider_reported",
        ingested_at: analyzedAtIso,
      });
    }
  }

  const events = [...dedup.values()]
    .sort((a, b) => Date.parse(b.event_time) - Date.parse(a.event_time))
    .slice(0, 5);
  if (events.length === 0) return { events, quality: "none_qualifying" };
  return { events, quality: "ok" };
}
