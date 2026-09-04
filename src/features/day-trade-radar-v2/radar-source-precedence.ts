/**
 * Day Trade Radar source precedence (D5.3).
 *
 * When the screener data layer selected Radar V2 as the preferred source
 * (`source === "radar-v2"`), those rows/status/timestamps are AUTHORITATIVE
 * during pre-market, regular market, and after-hours and must not be
 * superseded by the legacy `radar_v22_board` (`resolveRadarSource`). This
 * includes a healthy Radar V2 EMPTY generation, which must stay honestly
 * empty rather than falling back to legacy board rows.
 *
 * For any other source, the existing board/fallback resolution is preserved
 * exactly by delegating to `resolveRadarSource`.
 */

import { resolveRadarSource, type RadarV22View } from "@/lib/radar-v22";
import type { ScreenerResultRow, ScreenerUiStatus } from "@/lib/screeners/contract";
import type { ScreenerDataSource } from "@/lib/screeners/screener-copy";
import type { RadarEngineSource } from "./types";

export interface DayTradeRadarSourceInput {
  source: ScreenerDataSource | null | undefined;
  todayEt: string;
  adoptedSession: string | null;
  v21: {
    rows: ScreenerResultRow[];
    status: ScreenerUiStatus;
    syncedAt: string | null;
    providerAsOfMax: string | null;
  };
  v22: RadarV22View;
}

export interface DayTradeRadarSourceDecision {
  source: RadarEngineSource;
  rows: ScreenerResultRow[];
  status: ScreenerUiStatus;
  syncedAt: string | null;
  providerAsOfMax: string | null;
  /** Legacy board adoption bookkeeping; unchanged when Radar V2 is authoritative. */
  adoptedSession: string | null;
}

export function resolveDayTradeRadarSource(
  input: DayTradeRadarSourceInput,
): DayTradeRadarSourceDecision {
  if (input.source === "radar-v2") {
    // Authoritative Radar V2 candidate universe. Legacy board never overrides.
    return {
      source: "radar-v2-candidates",
      rows: input.v21.rows,
      status: input.v21.status,
      syncedAt: input.v21.syncedAt,
      providerAsOfMax: input.v21.providerAsOfMax,
      adoptedSession: input.adoptedSession,
    };
  }

  const legacy = resolveRadarSource({
    todayEt: input.todayEt,
    adoptedSession: input.adoptedSession,
    v21: input.v21,
    v22: input.v22,
  });

  return {
    source: legacy.source,
    rows: legacy.rows as ScreenerResultRow[],
    status: legacy.status,
    syncedAt: legacy.syncedAt,
    providerAsOfMax: legacy.providerAsOfMax,
    adoptedSession: legacy.adoptedSession,
  };
}
