import { supabase } from "@/integrations/supabase/client";
import type { CatalystEvent } from "@/types/catalyst";
import { hydrateCatalystEvents } from "@/lib/catalyst/catalyst-event-verification";

export const PUBLIC_CATALYST_CALENDAR_RPC = "public_catalyst_calendar_range_v1";
export const PUBLIC_CATALYST_MAX_RANGE_DAYS = 62;
export const PUBLIC_CATALYST_PAGE_SIZE = 500;
export const PUBLIC_CATALYST_MAX_PAGES = 12;

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
  event_status: string | null;
  impact_level: string | null;
  has_impact_evidence: boolean | null;
};

export type PublicCatalystFeedResult = {
  events: CatalystEvent[];
  totalCount: number;
  coverageIncomplete: boolean;
};

type RpcPage = {
  rows: PublicCatalystCalendarRow[];
  total_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
  coverage_incomplete: boolean;
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
  if (row.impact_level) facts.impact = row.impact_level;
  if (row.event_status === "cancelled") facts.status = "cancelled";
  if (row.event_status === "reported") facts.earnings_disposition = "results_reported";
  if (row.event_status === "scheduled") facts.earnings_disposition = "schedule_announced";
  if (row.has_impact_evidence) facts.impact_score = 1;

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

async function fetchPublicCatalystPage(
  from: string,
  to: string,
  limit: number,
  offset: number,
): Promise<RpcPage> {
  const { data, error } = await (supabase as unknown as {
    rpc: (
      fn: string,
      args: { p_from: string; p_to: string; p_limit: number; p_offset: number },
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
  }).rpc(PUBLIC_CATALYST_CALENDAR_RPC, {
    p_from: from,
    p_to: to,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  return (data ?? {
    rows: [],
    total_count: 0,
    has_more: false,
    coverage_incomplete: false,
  }) as RpcPage;
}

/** Canonical public-safe catalyst feed (homepage + /calendar) with paginated RPC. */
export async function fetchPublicCatalystCalendarRange(from: string, to: string): Promise<PublicCatalystFeedResult> {
  assertPublicCatalystRange(from, to);
  const allRows: PublicCatalystCalendarRow[] = [];
  let offset = 0;
  let totalCount = 0;
  let coverageIncomplete = false;

  for (let page = 0; page < PUBLIC_CATALYST_MAX_PAGES; page += 1) {
    const result = await fetchPublicCatalystPage(from, to, PUBLIC_CATALYST_PAGE_SIZE, offset);
    const rows = Array.isArray(result.rows) ? result.rows : [];
    allRows.push(...rows);
    totalCount = Number(result.total_count ?? allRows.length);
    coverageIncomplete = Boolean(result.coverage_incomplete) || totalCount > allRows.length;
    if (!result.has_more || rows.length < PUBLIC_CATALYST_PAGE_SIZE) break;
    offset += PUBLIC_CATALYST_PAGE_SIZE;
  }

  return {
    events: hydrateCatalystEvents(allRows.map(rowToCatalystEvent)),
    totalCount,
    coverageIncomplete,
  };
}