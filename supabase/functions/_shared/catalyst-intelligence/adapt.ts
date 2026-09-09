// Map a read-only catalyst_events row onto NormalizedCatalystInput.
// Does not invent fields or rewrite provider facts.

import type { NormalizedCatalystInput } from "./types.ts";
import type { CatalystEventRow } from "./select.ts";

function asStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

function asFacts(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Record<string, unknown>;
}

export function adaptCatalystEventRow(row: CatalystEventRow): NormalizedCatalystInput | null {
  if (!row.id || !row.dedupe_key || !row.symbol || !row.title || !row.provider) return null;
  if (!row.event_type || !row.source_name || !row.event_date) return null;
  return {
    id: row.id,
    dedupe_key: row.dedupe_key,
    symbol: row.symbol,
    company_name: row.company_name,
    event_type: row.event_type,
    verification_state: row.verification_state,
    event_date: row.event_date,
    event_time: row.event_time,
    time_of_day: row.time_of_day,
    title: row.title,
    description: row.description,
    source_name: row.source_name,
    source_url: row.source_url,
    provider: row.provider,
    provider_article_id: row.provider_article_id,
    related_symbols: asStringArray(row.related_symbols),
    facts: asFacts(row.facts),
    published_at: row.published_at,
    created_at: row.created_at,
  };
}
