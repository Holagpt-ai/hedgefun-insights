import type { LateSessionSourceCategory } from "@/config/late-session-handoff.config";
import type { PersistedLateSessionHandoffRow } from "@/lib/am-inbox/late-session-handoff-persistence";

/** Oct 27 Lovable read-only shape: 3,131 active rows (2,272 Mon + 859 Fri Day-Two). */
export const BATCH186_PRODUCTION_ROW_COUNT = 3_131;
export const BATCH186_MONDAY_SOURCE_COUNT = 2_272;
export const BATCH186_FRIDAY_DAY_TWO_COUNT = 859;
export const BATCH186_AM_SESSION_DATE = "2026-10-27";

const MONDAY_CATEGORIES: LateSessionSourceCategory[] = [
  "POWER_HOUR_MOMENTUM",
  "AFTER_HOURS_CONTINUATION",
  "STRONG_CLOSE_NEAR_HOD",
];

export function buildBatch186ProductionScaleRows(): PersistedLateSessionHandoffRow[] {
  const rows: PersistedLateSessionHandoffRow[] = [];
  let id = 0;

  const push = (
    symbol: string,
    sourceSessionDate: string,
    sourceCategory: LateSessionSourceCategory,
    volume: number,
    securitySuffix: string,
  ) => {
    id += 1;
    rows.push({
      id: `row-${id}`,
      security_id: `sec-${securitySuffix}`,
      symbol,
      source_session_date: sourceSessionDate,
      source_timestamp: `${sourceSessionDate}T21:15:00.000Z`,
      source_category: sourceCategory,
      last_price: 12 + (id % 50) * 0.1,
      session_move_pct: 5 + (id % 20),
      volume,
      rvol: 1 + (id % 30) * 0.2,
      dollar_volume: volume * 10,
      close_distance_from_hod_pct: 0.5 + (id % 10) * 0.1,
      after_hours_extends: sourceCategory === "AFTER_HOURS_CONTINUATION",
      catalyst_present: id % 3 === 0,
      float_turnover: null,
      historical_context_available: id % 5 !== 0,
      evidence_labels: [],
      sample_size_quality: "ADEQUATE",
      comparable_episode_count: id % 7,
      most_recent_comparable_date: "2026-10-20",
      profile_freshness: "FRESH",
      valid_from_session_date: "2026-10-27",
      valid_through_session_date: "2026-10-27",
      capture_freshness_class: "same_day",
    });
  };

  for (let i = 0; i < BATCH186_MONDAY_SOURCE_COUNT; i += 1) {
    const cat = MONDAY_CATEGORIES[i % MONDAY_CATEGORIES.length]!;
    push(`MON${i.toString().padStart(4, "0")}`, "2026-10-26", cat, 500_000 + (i % 100) * 25_000, `m${i}`);
  }
  for (let i = 0; i < BATCH186_FRIDAY_DAY_TWO_COUNT; i += 1) {
    push(`FRI${i.toString().padStart(4, "0")}`, "2026-10-23", "DAY_TWO_WATCH", 400_000 + (i % 80) * 20_000, `f${i}`);
  }

  return rows;
}
