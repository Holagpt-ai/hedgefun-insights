/**
 * Read-only Pre-Market Radar V1 shadow capture model.
 * Does not change production AM, screener qualification, or Radar V2.2.
 */

import type { CalendarExceptionRow, ResolvedSessionSchedule } from "@/lib/equities-session-calendar";
import type { CatalystEvent } from "@/types/catalyst";

/** Visible AM Top-N (TopNReveal default). */
export const PREMARKET_SHADOW_TOP_N = 3;

/** Bar-fetch universe after snapshot scoring. */
export const PREMARKET_BAR_FETCH_LIMIT = 60;

/** Snapshot pagination cap (same order of magnitude as the V2.2 worker). */
export const PREMARKET_SNAPSHOT_PAGE_CAP = 50;

export const DAY_TRADE_PRICE_MIN = 2;
export const DAY_TRADE_PRICE_MAX = 20;
export const DAY_TRADE_MOVE_MIN_PCT = 10;
export const DAY_TRADE_PRIOR_RATIO_MIN = 5;

/** Provider age ≤ 2 minutes is treated as current. */
export const QUALITY_CURRENT_MAX_MS = 2 * 60_000;
/** Provider age ≤ 20 minutes is delayed (Polygon delayed snapshot). */
export const QUALITY_DELAYED_MAX_MS = 20 * 60_000;
/** |day.c − lastTrade.p| / prevClose above this is provider-ambiguous. */
export const PRICE_FIELD_DIVERGE_PCT = 1;

export const LIFECYCLE_RULE =
  "share15 = vol15/cumulative. REACTIVATING if share15 < 0.10 and share5 >= 0.03 and prior15 > 0 and vol15 >= prior15 * 1.5. Else ACTIVE if share15 >= 0.10. Else DORMANT if share15 < 0.02. Else FADING if share15 < 0.05 and HOD distance > 3%. Else FADING if share15 < 0.05. Else ACTIVE.";

export type SnapshotTicker = {
  ticker?: unknown;
  updated?: unknown;
  todaysChangePerc?: unknown;
  day?: { c?: unknown; o?: unknown; v?: unknown; h?: unknown; l?: unknown };
  prevDay?: { c?: unknown; v?: unknown };
  lastTrade?: { p?: unknown; t?: unknown };
  min?: { c?: unknown; t?: unknown; v?: unknown; av?: unknown };
  [key: string]: unknown;
};

export type MinuteBar = {
  t: number;
  v: number;
  c: number | null;
  h: number | null;
  vw: number | null;
};

export type PriceSource = "lastTrade.p" | "min.c";

export type DataQualityFlag =
  | "current"
  | "fresh"
  | "delayed"
  | "stale"
  | "missing"
  | "provider-ambiguous";

export type LifecycleLabel = "ACTIVE" | "FADING" | "DORMANT" | "REACTIVATING";

export type PremarketGateReason =
  | "outside_window"
  | "closed_day"
  | "holiday"
  | "weekend"
  | "not_applicable";

export type CalendarSource =
  | "market_session_calendar"
  | "weekend_fallback_calendar_unavailable"
  | "static_holiday_list_calendar_unavailable";

export type PremarketWindow = {
  sessionDate: string;
  etTimeLabel: string;
  captureMs: number;
  windowStartMs: number;
  windowEndExclusiveMs: number;
  schedule: ResolvedSessionSchedule;
  calendarSource: CalendarSource;
};

export type PremarketGate =
  | { ok: true; window: PremarketWindow }
  | {
      ok: false;
      reason: PremarketGateReason;
      sessionDate: string;
      etTimeLabel: string;
      detail: string;
      nextCaptureHint: string;
    };

export type PriceComparison = {
  prevClose: number | null;
  dayC: number | null;
  lastTradeP: number | null;
  minC: number | null;
  todaysChangePerc: number | null;
  daySessionMovePct: number | null;
  lastTradeMovePct: number | null;
  minCloseMovePct: number | null;
  extendedPrice: number | null;
  extendedPriceSource: PriceSource | null;
  extendedMovePct: number | null;
};

export type VolumeComparison = {
  dayV: number | null;
  prevDayV: number | null;
  priorSessionRatio: number | null;
  minuteV: number | null;
  minuteAv: number | null;
  barCumulative: number | null;
  barDollarVolume: number | null;
  vol5: number | null;
  vol15: number | null;
  vol30: number | null;
  vol60: number | null;
  recentShare15: number | null;
  accel15: number | null;
  dayVOverBar: number | null;
};

export type ProductionExclusionReason = {
  symbol: string;
  reasons: string[];
  summary: string;
  lostToPriorSessionRatioOnly: boolean;
};

export type ShadowCatalyst = {
  present: boolean;
  eventType: string | null;
  title: string | null;
  source: string | null;
  publishedAt: string | null;
  ageMs: number | null;
};

export type ShadowCandidate = {
  symbol: string;
  rank: number;
  price: number | null;
  priceSource: PriceSource | null;
  changePct: number | null;
  cumulativeVolume: number | null;
  cumulativeDollarVolume: number | null;
  timestampIso: string | null;
  providerTimestampIso: string | null;
  qualityFlags: DataQualityFlag[];
  lifecycle: LifecycleLabel | null;
  hod: number | null;
  hodDistancePct: number | null;
  priceComp: PriceComparison;
  volumeComp: VolumeComparison;
  catalyst: ShadowCatalyst;
};

export type PersistedScreenerRow = {
  symbol: string;
  company_name?: string | null;
  price: number | null;
  change_percent: number | null;
  volume: number | null;
  rvol?: number | null;
  updated_at: string | null;
  provider_as_of?: string | null;
};

export type ProductionRow = {
  rank: number;
  symbol: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
};

export type FieldDivergenceSummary = {
  sampleSize: number;
  dayCNearPrevCloseCount: number;
  lastTradeMoveGe10Count: number;
  minMoveGe10Count: number;
  dayVMuchLargerThanBarCount: number;
  medianDayVOverBar: number | null;
};

export type PremarketShadowReport = {
  status: "captured" | "not_applicable";
  gate: PremarketGate;
  evaluatedAtIso: string;
  productionPersistedTop3: ProductionRow[];
  productionPersistedStatus: "available" | "empty" | "stale" | "unavailable";
  productionLiveDtrTop3: ProductionRow[];
  shadowTop: ShadowCandidate[];
  shadowQualifiedTop: ShadowCandidate[];
  productionExclusions: ProductionExclusionReason[];
  ratioOnlyExclusions: string[];
  missingData: ShadowCandidate[];
  fieldDivergence: FieldDivergenceSummary | null;
  lifecycleRule: string;
  notes: string[];
};

export type EvaluateInput = {
  window: PremarketWindow;
  tickers: SnapshotTicker[];
  barsBySymbol: Map<string, MinuteBar[]>;
  persistedScreener: PersistedScreenerRow[] | null;
  persistedScreenerError: string | null;
  catalysts: CatalystEvent[];
  nowMs: number;
};

export type { CalendarExceptionRow, CatalystEvent };
