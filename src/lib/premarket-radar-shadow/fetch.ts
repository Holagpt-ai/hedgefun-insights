import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  chunkSymbols,
  ENRICHMENT_BATCH_ROW_LIMIT,
  enrichmentFetchWindow,
  normalizeEnrichmentSymbols,
} from "@/lib/catalyst/enrichment";
import type { CalendarExceptionRow } from "@/lib/equities-session-calendar";
import type { CatalystEvent } from "@/types/catalyst";
import type { PersistedScreenerRow } from "./types";

const SCREENER_SELECT =
  "symbol,company_name,price,change_percent,volume,rvol,updated_at,provider_as_of";

const CATALYST_SELECT =
  "id, dedupe_key, symbol, company_name, event_type, verification_state, event_date, event_time, time_of_day, title, description, source_name, source_url, provider, related_symbols, facts, published_at";

const CALENDAR_SELECT =
  "session_date,market_status,regular_open_et,regular_close_et,after_hours_end_et,holiday_name";

export function createAnonClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function loadPersistedScreener(
  client: SupabaseClient,
): Promise<{ rows: PersistedScreenerRow[] | null; error: string | null }> {
  const res = await client
    .from("screener_results")
    .select(SCREENER_SELECT)
    .eq("tab_id", "day_trade_radar")
    .order("volume", { ascending: false, nullsFirst: false })
    .limit(24);
  if (res.error) return { rows: null, error: res.error.message };
  return { rows: (res.data ?? []) as PersistedScreenerRow[], error: null };
}

function parseExceptionRow(raw: unknown): CalendarExceptionRow | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const sessionDate = row.session_date;
  const marketStatus = row.market_status;
  const regularOpen = row.regular_open_et;
  const regularClose = row.regular_close_et;
  const afterHoursEnd = row.after_hours_end_et;
  if (typeof sessionDate !== "string") return null;
  if (marketStatus !== "closed" && marketStatus !== "early_close") {
    return null;
  }
  if (
    typeof regularOpen !== "string" ||
    typeof regularClose !== "string" ||
    typeof afterHoursEnd !== "string"
  ) {
    return null;
  }
  const holiday = row.holiday_name;
  if (holiday != null && typeof holiday !== "string") return null;
  const holidayName = typeof holiday === "string" ? holiday : null;
  return {
    session_date: sessionDate,
    market_status: marketStatus,
    regular_open_et: regularOpen,
    regular_close_et: regularClose,
    after_hours_end_et: afterHoursEnd,
    holiday_name: holidayName,
  };
}

export async function loadCalendarExceptions(
  client: SupabaseClient,
  sessionDate: string,
): Promise<{ exceptions: CalendarExceptionRow[] | null; error: string | null }> {
  const res = await client
    .from("market_session_calendar")
    .select(CALENDAR_SELECT)
    .eq("session_date", sessionDate);
  if (res.error) return { exceptions: null, error: res.error.message };
  const rows: CalendarExceptionRow[] = [];
  for (const raw of res.data ?? []) {
    const parsed = parseExceptionRow(raw);
    if (parsed) rows.push(parsed);
  }
  return { exceptions: rows, error: null };
}

async function fetchCatalystRows(
  client: SupabaseClient,
  symbols: string[],
  recentFrom: string,
  eventDateFrom: string,
  upcomingTo: string,
): Promise<CatalystEvent[]> {
  if (symbols.length === 0) return [];
  const { data, error } = await client
    .from("catalyst_events")
    .select(CATALYST_SELECT)
    .eq("verification_state", "provider_reported")
    .in("symbol", symbols)
    .or(
      `and(published_at.gte.${recentFrom}),and(event_date.gte.${eventDateFrom},event_date.lte.${upcomingTo})`,
    )
    .limit(ENRICHMENT_BATCH_ROW_LIMIT);
  if (error) throw error;
  return (data ?? []) as CatalystEvent[];
}

export async function loadCatalystsForSymbols(
  client: SupabaseClient,
  symbols: string[],
  nowMs: number,
): Promise<{ events: CatalystEvent[]; error: string | null }> {
  const key = normalizeEnrichmentSymbols(symbols);
  if (key.length === 0) return { events: [], error: null };
  const { recentFromIso, eventDateFrom, upcomingTo } = enrichmentFetchWindow(nowMs);
  const collected: CatalystEvent[] = [];
  const seen = new Set<string>();
  try {
    for (const batch of chunkSymbols(key)) {
      const rows = await fetchCatalystRows(
        client,
        batch,
        recentFromIso,
        eventDateFrom,
        upcomingTo,
      );
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        collected.push(row);
      }
    }
    return { events: collected, error: null };
  } catch (err) {
    return {
      events: [],
      error: err instanceof Error ? err.message : "catalyst_query_failed",
    };
  }
}
