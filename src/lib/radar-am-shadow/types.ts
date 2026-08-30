/**
 * Shared AM vs Radar V2.2 shadow comparison model.
 * Read-only evidence layer — does not change the visible AM Volume Leaders surface.
 */

import type { SessionKind } from "@/lib/equities-session-calendar";
import type {
  RadarV22BoardRow,
  RadarV22FeedState,
  RadarV22View,
} from "@/lib/radar-v22";

/** Visible AM Top-N (TopNReveal default). */
export const AM_SHADOW_TOP_N = 3;

/** Backend AM volume-leader cap in get-pre-market-workspace. */
export const AM_VOLUME_LEADER_LIMIT = 6;

/** Matches SCREENER_STALE_MINUTES in the pre-market contract. */
export const AM_SCREENER_STALE_MS = 30 * 60_000;

/**
 * V2.2 high-activity 60s share floor from RADAR_V22_CONFIG.highActivityShares60s.
 * Duplicated here so the Vite app does not import the worker package.
 */
export const V22_HIGH_ACTIVITY_VOL60 = 100_000;

/** Provider timestamp delta treated as materially newer. */
export const MATERIAL_NEWER_MS = 60_000;

/** V2.2 leader session volume below this fraction of the screener leader is "thin vs liquid". */
export const THIN_LIQUID_SESSION_RATIO = 0.5;

export const AM_SCREENER_SOURCE = "screener_results.day_trade_radar";
export const AM_V22_SOURCE = "radar_v22_board";

export type ShadowSourceId = typeof AM_SCREENER_SOURCE | typeof AM_V22_SOURCE;

export type ShadowQualificationState =
  | "included"
  | "dropped_no_volume"
  | "dropped_no_timestamp"
  | "empty_source"
  | "session_rejected"
  | "unavailable";

export type ShadowCandidate = {
  symbol: string;
  rank: number;
  price: number | null;
  changePercent: number | null;
  sessionVolume: number | null;
  providerTimestamp: string | null;
  rowTimestamp: string | null;
  dataAgeMs: number | null;
  source: ShadowSourceId;
  qualificationState: ShadowQualificationState;
  lifecycle: string | null;
  signalStatus: string | null;
  rollingVolume5s: number | null;
  rollingVolume15s: number | null;
  rollingVolume60s: number | null;
  rollingDollarVolume60s: number | null;
  acceleration5m: number | null;
  sessionVwap: number | null;
  distanceFromHodPct: number | null;
};

export type AmScreenerShadowRow = {
  symbol: string;
  company_name?: string | null;
  price: number | null;
  change_percent: number | null;
  volume: number | null;
  rvol?: number | null;
  updated_at: string | null;
  provider_as_of?: string | null;
};

export type RankPair = {
  symbol: string;
  screenerRank: number | null;
  v22Rank: number | null;
};

export type SessionSafetyFinding = {
  todayEt: string;
  evaluationSessionKind: SessionKind;
  v22SessionDate: string | null;
  v22FeedStatus: string | null;
  v22ClientStatus: string | null;
  v22RawRowCount: number;
  v22AdoptedRowCount: number;
  dateMismatch: boolean;
  /** Non-empty persisted board while Eastern session is not regular hours. */
  leftoverBoardOutsideRegular: boolean;
  /** Persisted board session_date is not today's ET date. */
  priorSessionBoard: boolean;
  /** Engine only evaluates during regular session (09:30–16:00 ET). */
  v22EvaluatesThisSession: boolean;
};

export type FreshnessFinding = {
  screenerProviderAsOfMax: string | null;
  screenerUpdatedAtMax: string | null;
  v22ProviderAsOfMax: string | null;
  v22NewerByMs: number | null;
  materiallyNewer: boolean | null;
  screenerStale: boolean;
  v22Stale: boolean;
};

export type VolumeFinding = {
  volumeFirstLeaderMatch: boolean | null;
  screenerLeaderSymbol: string | null;
  v22LeaderSymbol: string | null;
  thinOverLiquid: boolean;
  staleCumulativeSymbols: string[];
  freshVelocityNotInScreener: string[];
  highActivitySymbols: string[];
  acceleratingSymbols: string[];
  coolingSymbols: string[];
};

export type ShadowComparison = {
  evaluatedAtIso: string;
  evaluatedEt: string;
  todayEt: string;
  sessionKind: SessionKind;
  screenerStatus: "available" | "empty" | "stale" | "unavailable";
  v22Status: "available" | "empty" | "stale" | "unavailable";
  screenerTop3: ShadowCandidate[];
  v22Top3: ShadowCandidate[];
  overlapCount: number;
  overlapSymbols: string[];
  screenerOnly: string[];
  v22Only: string[];
  rankPairs: RankPair[];
  orderingDifferences: RankPair[];
  freshness: FreshnessFinding;
  volume: VolumeFinding;
  sessionSafety: SessionSafetyFinding;
};

export type ShadowCompareInput = {
  nowMs: number;
  screenerRows: AmScreenerShadowRow[] | null;
  v22View: RadarV22View;
  v22RawState: RadarV22FeedState | null;
  v22RawRows: RadarV22BoardRow[] | null;
  sessionKind?: SessionKind;
};
