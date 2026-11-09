import type { LateSessionSourceCategory } from "@/config/late-session-handoff.config";
import type { PersistedLateSessionHandoffRow } from "@/lib/am-inbox/late-session-handoff-persistence";

/**
 * November 9, 2026 production shape (owner-reported):
 * `late_session_handoff_list_active_v1('2026-11-09')` → 3,776 rows,
 * 1,525 distinct symbols, ~4.1 MB JSON, source sessions Nov 5 and Nov 6.
 */
export const BATCH217_PRODUCTION_ROW_COUNT = 3_776;
export const BATCH217_DISTINCT_SYMBOL_COUNT = 1_525;
export const BATCH217_AM_SESSION_DATE = "2026-11-09";
export const BATCH217_SOURCE_THU = "2026-11-05";
export const BATCH217_SOURCE_FRI = "2026-11-06";
/** Approximate production JSON size (bytes) for payload budget checks. */
export const BATCH217_JSON_BYTES_TARGET = 4_100_000;

const CATEGORIES: LateSessionSourceCategory[] = [
  "POWER_HOUR_MOMENTUM",
  "AFTER_HOURS_CONTINUATION",
  "STRONG_CLOSE_NEAR_HOD",
  "DAY_TWO_WATCH",
];

export function buildBatch217ProductionScaleRows(): PersistedLateSessionHandoffRow[] {
  const rows: PersistedLateSessionHandoffRow[] = [];
  const symbols = Array.from(
    { length: BATCH217_DISTINCT_SYMBOL_COUNT },
    (_, i) => `S${i.toString().padStart(4, "0")}`,
  );

  let id = 0;
  while (rows.length < BATCH217_PRODUCTION_ROW_COUNT) {
    const index = rows.length;
    const symbol = symbols[index % symbols.length]!;
    const sourceCategory = CATEGORIES[index % CATEGORIES.length]!;
    // Independent date axis so every category appears on both Thu and Fri.
    // Day-Two leans Thursday so Monday AM still exercises the longer window.
    const sourceSessionDate =
      sourceCategory === "DAY_TWO_WATCH"
        ? index % 5 === 0
          ? BATCH217_SOURCE_FRI
          : BATCH217_SOURCE_THU
        : Math.floor(index / CATEGORIES.length) % 2 === 0
          ? BATCH217_SOURCE_THU
          : BATCH217_SOURCE_FRI;
    id += 1;
    const volume = 500_000 + (id % 100) * 25_000;
    rows.push({
      id: `b217-${id}`,
      security_id: `sec-${symbol}`,
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
      most_recent_comparable_date: "2026-10-31",
      profile_freshness: "FRESH",
      valid_from_session_date: sourceSessionDate,
      valid_through_session_date: BATCH217_AM_SESSION_DATE,
      capture_freshness_class: "same_day",
    });
  }

  return rows;
}
