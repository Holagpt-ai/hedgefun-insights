import type { MarketDataTrustState } from "@/lib/market-data/trust-states";
import type { SecurityId } from "@/types/security-identity";

export const MORNING_OPPORTUNITY_LIMIT = 5;

export const MORNING_PREMARKET_MIN_RVOL_5M = 1.25;
export const MORNING_PREMARKET_MIN_ACCELERATION_PCT = 15;
export const MORNING_PREMARKET_MIN_VELOCITY = 25_000;

export const MORNING_SECTION_ORDER = [
  { id: "top_momentum", title: "Top Momentum" },
  { id: "premarket_continuation", title: "Premarket Continuation" },
  { id: "gap_continuation", title: "Gap Continuation" },
  { id: "day_two_watch", title: "Day-Two Watch" },
] as const;

export type MorningSectionId = (typeof MORNING_SECTION_ORDER)[number]["id"];

export const MORNING_EMPTY_MESSAGE = "No qualifying movers yet";

export type MorningRadarRow = {
  symbol: string;
  price?: number | null;
  volume?: number | null;
  gap_percent?: number | null;
  change_percent?: number | null;
  float_shares?: number | null;
  provider_as_of?: string | null;
  updated_at?: string | null;
  primary_scanner_event?: string | null;
  primary_scanner_event_at?: string | null;
  scanner_events?: unknown;
  rvol_5m?: number | null;
  time_adjusted_rvol?: number | null;
  vol_velocity?: number | null;
  volume_acceleration_pct?: number | null;
  rolling_dollar_volume_60s?: number | null;
  distance_from_hod_pct?: number | null;
  vwap_side?: string | null;
  move_60s_pct?: number | null;
  move_15s_pct?: number | null;
};

export type MorningOpportunityCard = {
  symbol: string;
  section: MorningSectionId;
  eventType: string | null;
  eventLabel: string | null;
  detectedAt: string | null;
  price: number | null;
  volume: number | null;
  dollarVolume: number | null;
  rvol5m: number | null;
  gapPercent: number | null;
  distanceFromHodPct: number | null;
  vwapSide: string | null;
  catalystStatus: "present" | "pending" | "none";
  trust: MarketDataTrustState;
  asOf: string | null;
  continuationCategory: string | null;
  securityId: SecurityId | null;
  qualificationSummary: string | null;
};

export type MorningOpportunitySection = {
  id: MorningSectionId;
  title: string;
  cards: MorningOpportunityCard[];
};

export type MorningOpportunityBoard = {
  sections: MorningOpportunitySection[];
  emptyMessage: string | null;
};
