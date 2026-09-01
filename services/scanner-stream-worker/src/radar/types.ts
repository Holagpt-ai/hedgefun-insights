import type {
  RadarV22BoardLifecycle,
  RadarV22Lifecycle,
} from "../../../../supabase/functions/_shared/radar-v22/types.ts";

export type AggregateSecondEvent = {
  ev: "A";
  sym: string;
  v: number;
  av: number | null;
  op: number | null;
  vw: number | null;
  o: number | null;
  c: number | null;
  h: number | null;
  l: number | null;
  a: number | null;
  z: number | null;
  s: number;
  e: number;
};

export type SecondBar = {
  startMs: number;
  endMs: number;
  volume: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  vwap: number | null;
  sessionVwap: number | null;
  sessionOpen: number | null;
  accumulatedVolume: number | null;
  dollarVolume: number;
  priceComplete: boolean;
  lateCorrected: boolean;
  correctionCount: number;
};

export type PriceWindow = {
  movePct: number | null;
  complete: boolean;
};

export type SymbolMetrics = {
  symbol: string;
  vol5s: number;
  vol15s: number;
  vol60s: number;
  dollarVol60s: number;
  sessionVolume: number;
  sessionHigh: number | null;
  sessionLow: number | null;
  sessionVwap: number | null;
  lastPrice: number | null;
  move15s: PriceWindow;
  move60s: PriceWindow;
  acceleration5m: number | null;
  providerLagMs: number | null;
  lastBarEndMs: number | null;
  lastBarStartMs: number | null;
  lateCorrectionInWindows: boolean;
  barCount: number;
};

export type EligibleQuote = {
  symbol: string;
  companyName: string | null;
  regularClose: number;
  previousClose: number;
  dayVolume: number;
  priorVolume: number;
  dayHigh: number | null;
  dayLow: number | null;
  volumeRatio: number;
  changePercent: number;
};

export type LifecycleRecord = {
  phase: RadarV22Lifecycle;
  consecutiveDetect: number;
  consecutiveActive: number;
  consecutiveActiveFail: number;
  consecutiveLowActivity: number;
  coolingEnteredAtMs: number | null;
  phaseEnteredAtMs: number | null;
  peakVol15WhileActive: number;
  sessionDate: string;
};

export type RankedCandidate = {
  symbol: string;
  lifecycle: RadarV22BoardLifecycle;
  vol5s: number;
  vol15s: number;
  vol60s: number;
  dollarVol60s: number;
  sessionVolume: number;
  acceleration5m: number | null;
  freshnessAgeMs: number | null;
  lastPrice: number;
  changePercent: number;
  priorVolume: number;
  volumeRatio: number;
  dayHigh: number;
  dayLow: number;
  sessionVwap: number | null;
  peakVol15: number | null;
  companyName: string | null;
  providerAsOfMs: number;
};

export type RadarConnectionState =
  | "idle"
  | "connecting"
  | "authenticating"
  | "subscribed"
  | "reconnecting"
  | "disconnected";

export type RadarHealthStatus = "running" | "degraded" | "stale";

export type RadarHealthSnapshot = {
  status: RadarHealthStatus;
  connection_state: RadarConnectionState;
  last_provider_event_at: string | null;
  last_published_generation: string | null;
  active_symbol_count: number;
  correction_count: number;
  duplicate_count: number;
  out_of_order_count: number;
  reconnect_count: number;
  lease_held: boolean;
  sentinel_enabled: boolean;
  sentinel_live: number;
  promoted_count: number;
  promotion_cap: number;
  sentinel_evictions: number;
  promotions_total: number;
  demotions_total: number;
  cap_rejections: number;
  rss_bytes: number | null;
};

export type SentinelStats = {
  enabled: boolean;
  live: number;
  promoted: number;
  cap: number;
  evictions: number;
  promotionsTotal: number;
  demotionsTotal: number;
  capRejections: number;
  rssBytes: number | null;
};

export type PromotionReason =
  | "absolute_60s"
  | "absolute_5s"
  | "absolute_15s"
  | "burst_5s"
  | "burst_15s";

export type PromotionDecision = {
  promote: boolean;
  reason: PromotionReason | null;
};

export type SentinelMetrics = {
  symbol: string;
  lastStartMs: number;
  lastEndMs: number;
  lastVolume: number;
  lastClose: number | null;
  lastDollarVolume: number;
  vol5s: number;
  vol15s: number;
  vol60s: number;
  dollarVol5s: number;
  dollarVol15s: number;
  dollarVol60s: number;
  sessionVolume: number;
  lastSeenMs: number;
  observedSeconds: number;
  precedingVol5Baseline: number;
  precedingSeconds5: number;
  expected5: number | null;
  precedingVol15Baseline: number;
  precedingSeconds15: number;
  expected15: number | null;
};

export type EngineCounters = {
  correctionCount: number;
  duplicateCount: number;
  outOfOrderCount: number;
  reconnectCount: number;
};

export type IngestResult =
  | { accepted: false; reason: "invalid" | "ignored" }
  | {
    accepted: true;
    kind:
      | "new"
      | "duplicate"
      | "correction"
      | "late_correction"
      | "out_of_order";
    symbol: string;
    startMs: number;
    endMs: number;
  };
