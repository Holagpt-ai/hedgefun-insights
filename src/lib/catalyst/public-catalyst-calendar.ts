import { supabase } from "@/integrations/supabase/client";
import type { CatalystEvent } from "@/types/catalyst";
import { hydrateCatalystEvents } from "@/lib/catalyst/catalyst-event-verification";

export const PUBLIC_CATALYST_CALENDAR_RPC = "public_catalyst_calendar_range_v1";
export const PUBLIC_CATALYST_MAX_RANGE_DAYS = 62;

export type PublicCatalystCalendarRow = {
  id: string;
  dedupe_key: string;
  symbol: string;
  company_name: string | null;
  event_type: string;
  event_date: string;
  event_time: string | null;
  time_of_day: string | null;
  title: string;
  description: string | null;
  source_name: string | null;
  source_url: string | null;
  provider: string;
  related_symbols: string[] | null;
  published_at: string | null;
  attribution_class: string | null;
  ticker_specific: boolean | null;
};

function assertYmd(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("invalid_date");
  }
}

export function assertPublicCatalystRange(from: string, to: string): void {
  assertYmd(from);
  assertYmd(to);
  if (from > to) throw new Error("inverted_range");
  const fromMs = Date.parse(`${from}T12:00:00Z`);
  const toMs = Date.parse(`${to}T12:00:00Z`);
  const days = Math.round((toMs - fromMs) / 86_400_000) + 1;
  if (days > PUBLIC_CATALYST_MAX_RANGE_DAYS) throw new Error("range_too_large");
}

function rowToCatalystEvent(row: PublicCatalystCalendarRow): CatalystEvent {
  const facts: Record<string, unknown> = {};
  if (row.attribution_class) facts.attribution_class = row.attribution_class;
  if (row.ticker_specific !== null) facts.ticker_specific = row.ticker_specific;
  return {
    id: row.id,
    dedupe_key: row.dedupe_key,
    symbol: row.symbol,
    company_name: row.company_name,
    event_type: row.event_type as CatalystEvent["event_type"],
    verification_state: "provider_reported",
    event_date: row.event_date,
    event_time: row.event_time,
    time_of_day: row.time_of_day as CatalystEvent["time_of_day"],
    title: row.title,
    description: row.description,
    source_name: row.source_name,
    source_url: row.source_url,
    provider: row.provider,
    related_symbols: row.related_symbols ?? [],
    facts,
    published_at: row.published_at,
    attribution_class: row.attribution_class as CatalystEvent["attribution_class"],
    ticker_specific: row.ticker_specific ?? undefined,
  } as CatalystEvent;
}

/** Canonical public-safe catalyst feed (homepage + /calendar). */
export async function fetchPublicCatalystCalendarRange(from: string, to: string): Promise<CatalystEvent[]> {
  assertPublicCatalystRange(from, to);
  const { data, error } = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: { p_from: string; p_to: string },
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc(PUBLIC_CATALYST_CALENDAR_RPC, {
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as PublicCatalystCalendarRow[];
  return hydrateCatalystEvents(rows.map(rowToCatalystEvent));
}