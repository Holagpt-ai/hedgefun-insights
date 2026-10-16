/**
 * Separates historical scanner triggers from current participation states.
 */

import {
  DAY_TRADE_FRESHNESS_RECENT_MS,
} from "@/config/day-trade-freshness.config";
import { evaluateDayTradeFreshness } from "@/features/day-trade-radar-v2/day-trade-freshness";
import { mapVolumeTrend } from "@/features/day-trade-radar-v2/multi-radar";
import type { RadarRankedRow } from "@/features/day-trade-radar-v2/types";
import { formatEtClock } from "@/lib/screeners/screener-trigger-time";
import { parseTimestampMs } from "@/lib/screeners/contract";
import { toCanonicalUtcTimestamp } from "@/lib/screeners/trigger-time";

export interface ParticipationTriggerEvidence {
  triggerAt: string | null;
  triggerLabel: string | null;
  triggerAgeMs: number | null;
  participationLabel: string;
  participationSupported: boolean;
  headline: string;
  detail: string;
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

export function buildParticipationTriggerEvidence(
  row: RadarRankedRow,
  nowMs: number,
): ParticipationTriggerEvidence {
  const triggerAt = toCanonicalUtcTimestamp(row.primary_scanner_event_at ?? null);
  const triggerMs = triggerAt ? parseTimestampMs(triggerAt) : null;
  const triggerAgeMs = triggerMs === null ? null : Math.max(0, nowMs - triggerMs);
  const triggerClock = formatEtClock(triggerAt);
  const triggerLabel = row.primary_scanner_event ?? null;

  const freshness = evaluateDayTradeFreshness(row, nowMs);
  const participation = participationLabel(row);
  const participationSupported = freshness.eligibleForMainDesk && participation !== "COOLING";

  const historicalTrigger =
    triggerAgeMs !== null && triggerAgeMs > DAY_TRADE_FRESHNESS_RECENT_MS;

  let headline: string;
  if (historicalTrigger && participation === "COOLING") {
    headline = `Historical ${triggerLabel ?? "trigger"} · currently cooling`;
  } else if (historicalTrigger && participationSupported) {
    headline = `Historical ${triggerLabel ?? "trigger"} · current participation supported`;
  } else if (triggerClock && participationSupported) {
    headline = `${triggerLabel ?? "Trigger"} ${triggerClock} · ${participation} now`;
  } else if (historicalTrigger) {
    headline = `Historical ${triggerLabel ?? "trigger"} — not current acceleration proof`;
  } else {
    headline = participationSupported
      ? `Current participation: ${participation}`
      : "Participation not supported by current evidence";
  }

  const detailParts: string[] = [];
  if (triggerClock) detailParts.push(`Event trigger ${triggerClock} ET (preserved)`);
  detailParts.push(`Freshness ${freshness.state}`);
  if (participation === "COOLING") {
    detailParts.push("Current 5m acceleration is negative or cooling");
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
