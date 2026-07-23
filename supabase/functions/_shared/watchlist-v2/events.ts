// Map Finnhub company-news items to RecentEvent[].
// 48h window. Deterministic SHA-256 event_id from ticker+epoch+normalized headline.

import type { RecentEvent } from "./contract.ts";

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

function normalizeHeadline(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * @param rawArticles Raw Finnhub /company-news array or null on transport failure.
 * @param now Current instant; used for a 48h look-back / +5min forward window.
 * @param analyzedAtIso ISO stamped as ingested_at.
 * @param ticker Normalized ticker used inside deterministic event_id.
 */
export async function mapNewsEvents(
  rawArticles: unknown,
  now: Date,
  analyzedAtIso: string,
  ticker: string,
): Promise<MapNewsResult> {
  if (rawArticles === null) return { events: [], quality: "missing" };
  if (!Array.isArray(rawArticles)) return { events: [], quality: "missing" };
  const nowMs = now.getTime();
  const back = nowMs - 48 * 60 * 60 * 1000;
  const forward = nowMs + 5 * 60 * 1000;

  const dedup = new Map<string, RecentEvent>();
  for (const raw of rawArticles) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const headline = r.headline;
    if (!isNonEmptyStr(headline)) continue;
    const dt = r.datetime;
    if (typeof dt !== "number" || !Number.isFinite(dt)) continue;
    const ms = Math.round(dt * 1000);
    if (ms < back || ms > forward) continue;
    if (!isNonEmptyStr(r.source)) continue;
    const source = r.source as string;

    const urlRaw = r.url;
    const url = isNonEmptyStr(urlRaw) && urlRaw.startsWith("https://") ? urlRaw : null;

    const epochSec = Math.floor(ms / 1000);
    const norm = normalizeHeadline(headline as string);
    const eventId = await sha256Hex(`${ticker}|${epochSec}|${norm}`);

    if (dedup.has(eventId)) continue;
    dedup.set(eventId, {
      event_id: eventId,
      event_type: "news",
      title: truncate((headline as string).trim(), 300),
      event_time: new Date(ms).toISOString(),
      source_name: source,
      source_url: url,
      verification_state: "provider_reported",
      ingested_at: analyzedAtIso,
    });
  }

  const events = [...dedup.values()]
    .sort((a, b) => Date.parse(b.event_time) - Date.parse(a.event_time))
    .slice(0, 5);
  if (events.length === 0) return { events, quality: "none_qualifying" };
  return { events, quality: "ok" };
}
