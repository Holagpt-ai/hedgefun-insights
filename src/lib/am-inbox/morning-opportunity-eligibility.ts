/**
 * Deterministic Morning Opportunity qualification explanations.
 * Surfaces differ from Penny/Gappers/Volume tabs — volume alone is insufficient.
 */

import type { AmInboxLateSessionCandidate } from "@/lib/am-inbox/late-session-continuation-types";
import type { MorningRadarRow, MorningSectionId } from "@/lib/am-inbox/morning-opportunity-types";
import {
  MORNING_PREMARKET_MIN_ACCELERATION_PCT,
  MORNING_PREMARKET_MIN_RVOL_5M,
  MORNING_PREMARKET_MIN_VELOCITY,
} from "@/lib/am-inbox/morning-opportunity-types";
import { resolveSessionGapPercent, sessionGapEligible } from "@/lib/daily-intelligence/session-gap-evidence";
import {
  MOMENTUM_EVENT_TYPES,
  SCANNER_EVENT_MIN_SESSION_VOLUME,
  canonicalIntelligenceEventType,
} from "@/lib/scanner-intelligence/event-model";
import { GAPPER_MIN_ABS_PERCENT } from "@/lib/screeners/radar-gapper-restoration";
import type { MarketDataTrustState } from "@/lib/market-data/trust-states";
import type { ScreenerUiStatus } from "@/lib/screeners/contract";
import { collectScannerEventTypes } from "@/lib/scanner-intelligence/scanner-event-handoff";

export function morningBoardConfirmedPremarket(polygonPremarketActive: boolean): boolean {
  return polygonPremarketActive === true;
}

export type MorningQualificationPath =
  | "momentum_event"
  | "gap_continuation"
  | "premarket_participation"
  | "prior_session_continuation"
  | "volume_only"
  | "below_min_volume";

export type MorningRejectionCode =
  | "BELOW_MIN_VOLUME"
  | "VOLUME_ONLY_NO_EVENT"
  | "PREMARKET_NOT_CONFIRMED"
  | "GAP_BELOW_THRESHOLD"
  | "NO_POSITIVE_MOVE"
  | "MISSING_RVOL_PARTICIPATION"
  | "CONTINUATION_EXPIRED"
  | "GENERATION_STALE";

export interface MorningOpportunityEligibility {
  symbol: string;
  accepted: boolean;
  section: MorningSectionId | null;
  path: MorningQualificationPath;
  reasons: string[];
  rejectionCodes: MorningRejectionCode[];
}

function finite(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value;
}

function eventTypesOf(row: MorningRadarRow): string[] {
  return collectScannerEventTypes(row);
}

function hasMomentumEvent(events: readonly string[]): boolean {
  return events.some((event) => {
    const type = canonicalIntelligenceEventType(event);
    return type !== null && (MOMENTUM_EVENT_TYPES as readonly string[]).includes(type);
  });
}

function positiveShortWindowOrSessionMove(row: MorningRadarRow): boolean {
  const move = finite(row.move_60s_pct) ?? finite(row.move_15s_pct);
  if (move !== null && move > 0) return true;
  const sessionMove = finite(row.change_percent);
  return sessionMove !== null && sessionMove > 0;
}

function gapContinuationEligible(row: MorningRadarRow): boolean {
  return sessionGapEligible(row, GAPPER_MIN_ABS_PERCENT);
}

function premarketParticipation(row: MorningRadarRow): boolean {
  if (!positiveShortWindowOrSessionMove(row)) return false;
  const rvol = finite(row.rvol_5m) ?? finite(row.time_adjusted_rvol);
  const accel = finite(row.volume_acceleration_pct);
  const velocity = finite(row.vol_velocity);
  return (rvol !== null && rvol >= MORNING_PREMARKET_MIN_RVOL_5M) ||
    (accel !== null && accel >= MORNING_PREMARKET_MIN_ACCELERATION_PCT) ||
    (velocity !== null && velocity >= MORNING_PREMARKET_MIN_VELOCITY);
}

function sectionForRadar(
  events: readonly string[],
  confirmedPremarket: boolean,
  row: MorningRadarRow,
): MorningSectionId | null {
  if (events.some((event) => canonicalIntelligenceEventType(event) === "GAP_CONTINUATION")) {
    return "gap_continuation";
  }
  if (confirmedPremarket && gapContinuationEligible(row)) return "gap_continuation";
  if (hasMomentumEvent(events)) return "top_momentum";
  if (confirmedPremarket && premarketParticipation(row)) return "premarket_continuation";
  return null;
}

export function evaluateMorningRadarEligibility(
  row: MorningRadarRow,
  confirmedPremarket: boolean,
): MorningOpportunityEligibility {
  const symbol = row.symbol?.trim().toUpperCase() ?? "";
  const volume = finite(row.volume);
  const reasons: string[] = [];
  const rejectionCodes: MorningRejectionCode[] = [];

  if (!symbol) {
    return {
      symbol: "",
      accepted: false,
      section: null,
      path: "below_min_volume",
      reasons: ["Missing symbol"],
      rejectionCodes: ["BELOW_MIN_VOLUME"],
    };
  }

  if (volume === null || volume < SCANNER_EVENT_MIN_SESSION_VOLUME) {
    rejectionCodes.push("BELOW_MIN_VOLUME");
    reasons.push(
      `Session volume below ${SCANNER_EVENT_MIN_SESSION_VOLUME.toLocaleString("en-US")} minimum`,
    );
    return {
      symbol,
      accepted: false,
      section: null,
      path: "below_min_volume",
      reasons,
      rejectionCodes,
    };
  }

  const events = eventTypesOf(row);
  const section = sectionForRadar(events, confirmedPremarket, row);

  if (section) {
    const path: MorningQualificationPath =
      section === "top_momentum"
        ? "momentum_event"
        : section === "gap_continuation"
          ? "gap_continuation"
          : "premarket_participation";
    if (path === "momentum_event") {
      reasons.push("Recorded scanner momentum event with qualifying session volume");
    } else if (path === "gap_continuation") {
      reasons.push(
        events.some((e) => canonicalIntelligenceEventType(e) === "GAP_CONTINUATION")
          ? "Gap continuation event"
          : `Session gap ≥ ${GAPPER_MIN_ABS_PERCENT}% with confirmed pre-market`,
      );
    } else {
      reasons.push("Premarket participation: positive move plus RVOL, acceleration, or velocity");
    }
    return { symbol, accepted: true, section, path, reasons, rejectionCodes: [] };
  }

  rejectionCodes.push("VOLUME_ONLY_NO_EVENT");
  reasons.push("Volume qualifies other tabs but not Morning Opportunity rules");

  if (hasMomentumEvent(events) === false && events.length === 0) {
    reasons.push("No active scanner momentum or gap event");
  }

  if (!confirmedPremarket) {
    rejectionCodes.push("PREMARKET_NOT_CONFIRMED");
    reasons.push("Eventless gap/participation requires confirmed Polygon pre-market");
  } else {
    if (!gapContinuationEligible(row)) {
      rejectionCodes.push("GAP_BELOW_THRESHOLD");
      const gap = resolveSessionGapPercent(row);
      reasons.push(
        gap === null
          ? "Session gap unavailable"
          : `Session gap ${gap.toFixed(1)}% below ${GAPPER_MIN_ABS_PERCENT}% threshold`,
      );
    }
    if (!positiveShortWindowOrSessionMove(row)) {
      rejectionCodes.push("NO_POSITIVE_MOVE");
      reasons.push("No positive short-window or session move for participation");
    } else if (!premarketParticipation(row)) {
      rejectionCodes.push("MISSING_RVOL_PARTICIPATION");
      const rvol = finite(row.rvol_5m) ?? finite(row.time_adjusted_rvol);
      reasons.push(
        rvol === null
          ? "5-minute RVOL and time-adjusted RVOL unavailable — participation cannot be verified yet"
          : "RVOL, acceleration, and velocity below premarket participation minimums",
      );
    }
  }

  return {
    symbol,
    accepted: false,
    section: null,
    path: "volume_only",
    reasons,
    rejectionCodes,
  };
}

export function evaluateMorningContinuationEligibility(
  entry: AmInboxLateSessionCandidate,
): MorningOpportunityEligibility {
  const symbol = entry.context.symbol.trim().toUpperCase();
  if (entry.context.expiryState === "expired") {
    return {
      symbol,
      accepted: false,
      section: null,
      path: "prior_session_continuation",
      reasons: ["Prior-session handoff expired for this AM session"],
      rejectionCodes: ["CONTINUATION_EXPIRED"],
    };
  }
  const categories = entry.sourceCategories.length > 0
    ? entry.sourceCategories
    : [entry.context.sourceCategory];
  const onlyDayTwo = categories.length > 0 && categories.every((cat) => cat === "DAY_TWO_WATCH");
  return {
    symbol,
    accepted: true,
    section: onlyDayTwo ? "day_two_watch" : "premarket_continuation",
    path: "prior_session_continuation",
    reasons: [`Prior-session continuation: ${categories.join(", ")}`],
    rejectionCodes: [],
  };
}

export function resolveMorningOpportunityEmptyMessage(input: {
  radarRows?: readonly MorningRadarRow[] | null;
  radarStatus?: ScreenerUiStatus | null;
  polygonPremarketActive?: boolean;
  radarTrust?: MarketDataTrustState;
  generationStale?: boolean;
  continuationQualified?: number;
}): string {
  if (input.generationStale || input.radarTrust === "STALE") {
    return "Volume leader generation is stale — refresh for current qualification evidence";
  }
  if (input.radarStatus === "unavailable") {
    return "Volume leaders unavailable — Morning Opportunity needs a current radar generation";
  }
  const confirmedPremarket = morningBoardConfirmedPremarket(input.polygonPremarketActive === true);
  if (!confirmedPremarket && (input.radarRows?.length ?? 0) > 0) {
    return "No qualifying movers yet — confirmed pre-market is required for gap and participation paths";
  }

  const rejections = (input.radarRows ?? [])
    .map((row) => evaluateMorningRadarEligibility(row, confirmedPremarket))
    .filter((row) => !row.accepted && row.path === "volume_only");

  const missingRvol = rejections.filter((row) =>
    row.rejectionCodes.includes("MISSING_RVOL_PARTICIPATION")
  ).length;

  if (missingRvol > 0 && rejections.length === missingRvol) {
    return "High-volume names present — waiting on 5-minute RVOL or participation signals";
  }

  if (rejections.length > 0) {
    return "High-volume names present — none meet momentum, gap, or premarket participation rules";
  }

  if ((input.continuationQualified ?? 0) === 0 && (input.radarRows?.length ?? 0) === 0) {
    return "No qualifying movers yet";
  }

  return "No qualifying movers yet";
}
