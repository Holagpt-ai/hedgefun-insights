/** Client shape for `public.economic_events` (migration prepared; not applied in production). */
export interface EconomicCalendarRow {
  id: string;
  dedupe_key: string | null;
  event_name: string;
  country: string | null;
  event_date: string;
  event_time: string | null;
  importance: string | null;
  actual_value: string | null;
  consensus_estimate: string | null;
  previous_value: string | null;
  units: string | null;
  source: string | null;
  source_url: string | null;
  provider: string | null;
  description: string | null;
  actual_reported_at: string | null;
  fetched_at: string | null;
}

export type EconomicFeedStatus =
  | "ready"
  | "empty_in_range"
  | "never_synced"
  | "unavailable"
  | "error";

export interface EconomicFeedResult {
  status: EconomicFeedStatus;
  events: EconomicCalendarRow[];
  message?: string;
  lastSyncAt?: string | null;
  coverageWindow?: { from: string; to: string } | null;
}