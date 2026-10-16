/**
 * Separates historical scanner triggers from current participation states.
 */

import {
  DAY_TRADE_FRESHNESS_ACTIVE_MS,
  DAY_TRADE_FRESHNESS_RECENT_MS,
} from "@/config/day-trade-freshness.config";
import { evaluateDayTradeFreshness } from "@/features/day-trade-radar-v2/day-trade-freshness";
import { mapVolumeTrend } from "@/features/day-trade-radar-v2/multi-radar";
import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";
import { formatEtClock } from "@/lib/screeners/screener-trigger-time";
import { parseTimestampMs, type ScreenerUiStatus } from "@/lib/screeners/contract";
import { toCanonicalUtcTimestamp } from "@/lib/screeners/trigger-time";
import {
  parseTrustSourceMs,
  resolveScreenerMarketDataTrust,
  trustStateLabel,
  type MarketDataTrustState,
} from "@/lib/market-data/trust-states";
import {
  deriveMarketFeedDisplayTier,
  type MarketFeedTelemetry,
} from "@/lib/market-feed/telemetry";

export interface ParticipationTriggerEvidence {
  triggerAt: string | null;
  triggerLabel: string | null;
  triggerAgeMs: number | null;
  participationLabel: string;
  participationSupported: boolean;
  headline: string;
  detail: string;
}

export interface ParticipationEvidenceOptions {
  marketFeed?: MarketFeedTelemetry | null;
  status?: ScreenerUiStatus;
}

function participationLabel(row: RadarRankedRow): string {
  const raw = (row.participation_state ?? row.signal_status ?? row.signal ?? "").trim().toUpperCase();
  if (raw === "SURGING" || raw === "EXTREME" || raw === "RISING") return raw;
  if (raw === "COOLING") return "COOLING";
  const trend = mapVolumeTrend(row.volume_acceleration_pct).label;
  if (trend === "COOLING ↓") return "COOLING";
  if (trend === "SURGING ↑↑" || trend === "EXTREME ↑↑") return "SURGING";
  if (trend === "RISING ↑") return "RISING";
  return "STEADY";
}

function canClaimCurrentParticipation(
  trust: MarketDataTrustState,
  observationAgeMs: number | null,
  marketFeed: MarketFeedTelemetry | null | undefined,
  nowMs: number,
): boolean {
  if (trust !== "FRESH") return false;
  if (observationAgeMs === null || observationAgeMs > DAY_TRADE_FRESHNESS_ACTIVE_MS) return false;
  if (!marketFeed) return false;
  const tier = deriveMarketFeedDisplayTier(marketFeed, nowMs);
  return tier === "streaming" || tier === "near_realtime";
}

function describeParticipationState(
  participation: string,
  canClaimCurrent: boolean,
  observationClock: string | null,
  trust: MarketDataTrustState,
): string {
  if (canClaimCurrent && observationClock) {
    return `${participation} at verified observation (${observationClock})`;
  }
  const trustLabel = trustStateLabel(trust).toLowerCase();
  if (observationClock) {
    return `Last observed ${participation} as of ${observationClock} (${trustLabel} snapshot)`;
  }
  return `Participation unverified on snapshot (${participation}; ${trustLabel})`;
}

export function buildParticipationTriggerEvidence(
  row: RadarRankedRow,
  nowMs: number,
  options: ParticipationEvidenceOptions = {},
): ParticipationTriggerEvidence {
  const triggerAt = toCanonicalUtcTimestamp(row.primary_scanner_event_at ?? null);
  const triggerMs = triggerAt ? parseTimestampMs(triggerAt) : null;
  const triggerAgeMs = triggerMs === null ? null : Math.max(0, nowMs - triggerMs);
  const triggerClock = formatEtClock(triggerAt);
  const triggerLabel = row.primary_scanner_event ?? null;

  const observationMs = parseTrustSourceMs(row.provider_as_of ?? null);
  const observationAgeMs =
    observationMs === null ? null : Math.max(0, nowMs - observationMs);
  const observationClock = formatEtClock(row.provider_as_of ?? null);
  const trust = resolveScreenerMarketDataTrust({
    status: options.status ?? "available",
    providerAsOfMax: row.provider_as_of ?? null,
    syncedAt: row.provider_as_of ?? null,
    marketFeed: options.marketFeed ?? null,
    nowMs,
  });
  const canClaimCurrent = canClaimCurrentParticipation(
    trust,
    observationAgeMs,
    options.marketFeed,
    nowMs,
  );

  const freshness = evaluateDayTradeFreshness(row, nowMs);
  const participation = participationLabel(row);
  const participationDescriptor = describeParticipationState(
    participation,
    canClaimCurrent,
    observationClock,
    trust,
  );
  const participationSupported =
    canClaimCurrent && freshness.eligibleForMainDesk && participation !== "COOLING";

  const historicalTrigger =
    triggerAgeMs !== null && triggerAgeMs > DAY_TRADE_FRESHNESS_RECENT_MS;

  let headline: string;
  if (historicalTrigger) {
    headline = `Historical ${triggerLabel ?? "trigger"} · ${participationDescriptor}`;
  } else if (triggerClock) {
    headline = `${triggerLabel ?? "Trigger"} ${triggerClock} · ${participationDescriptor}`;
  } else {
    headline = participationDescriptor;
  }

  const detailParts: string[] = [];
  if (triggerClock) detailParts.push(`Event trigger ${triggerClock} (preserved)`);
  detailParts.push(`Freshness ${freshness.state}`);
  detailParts.push(`Market data ${trustStateLabel(trust).toLowerCase()}`);
  if (!canClaimCurrent) {
    detailParts.push("Not described as live activity without verified recent observation");
  } else if (participation === "COOLING") {
    detailParts.push("5m acceleration negative or cooling at last verified observation");
  } else if (!participationSupported) {
    detailParts.push("Participation gates not met for live desk eligibility");
  }

  return {
    triggerAt,
    triggerLabel,
    triggerAgeMs,
    participationLabel: participation,
    participationSupported,
    headline,
    detail: detailParts.join(". "),
  };
}
