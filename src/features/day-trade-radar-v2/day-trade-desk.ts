/**
 * Authoritative Day Trade desk dataset for UI consumption.
 * Radar universe → Five Pillars → freshness → opportunity rank → Top 10.
 */

import { buildDayTradeRadarOpportunityBoard } from "./day-trade-radar-opportunity";
import type { DayTradeRadarOpportunityBoard } from "./day-trade-radar-opportunity";
import type { RadarRankedRow } from "./types";

export type { DayTradeRadarOpportunityBoard };

/** Single source for Day Trade Top Leader, table, counts, and ranks. */
export function buildAuthoritativeDayTradeDesk(
  rankedUniverse: readonly RadarRankedRow[],
  nowMs: number,
): DayTradeRadarOpportunityBoard {
  return buildDayTradeRadarOpportunityBoard(rankedUniverse, nowMs);
}

export function authoritativeDayTradeLeader(
  deskRows: readonly RadarRankedRow[],
): RadarRankedRow | null {
  return deskRows[0] ?? null;
}
