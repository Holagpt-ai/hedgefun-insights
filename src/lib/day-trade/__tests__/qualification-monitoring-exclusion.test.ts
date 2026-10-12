import { describe, expect, it } from "vitest";
import { monitoringStates } from "@/lib/day-trade/qualification-lifecycle-client";
import type { DayTradeQualificationStateRow } from "@/lib/day-trade/qualification-lifecycle-client";

function state(
  overrides: Partial<DayTradeQualificationStateRow> & { symbol: string },
): DayTradeQualificationStateRow {
  return {
    session_date: "2026-10-12",
    symbol: overrides.symbol,
    pillar_phase: "ACTIVE",
    first_qualified_at: "2026-10-12T08:00:00.000Z",
    last_qualified_at: "2026-10-12T08:00:00.000Z",
    grace_first_failure_at: null,
    grace_failure_count: 0,
    pillar_expired_at: null,
    pillar_expiration_reason_codes: [],
    ever_on_desk: true,
    currently_on_desk: false,
    first_desk_at: "2026-10-12T08:00:00.000Z",
    last_desk_at: "2026-10-12T08:10:00.000Z",
    last_desk_departure_at: "2026-10-12T08:10:00.000Z",
    last_desk_departure_reason: "TOP10_DISPLACED",
    five_pillars_pass: true,
    monitoring_eligible: true,
    monitoring_data_status: "LIVE",
    pillar_outcomes: null,
    monitored_price: 5,
    monitored_volume: 1_000_000,
    provider_as_of: "2026-10-12T08:10:00.000Z",
    prior_episodes: [],
    last_snapshot_key: "k",
    last_market_data_ms: 1_000,
    updated_at: "2026-10-12T08:10:00.000Z",
    ...overrides,
  } as DayTradeQualificationStateRow;
}

describe("monitoring list vs live desk", () => {
  it("excludes a symbol that is on the live authoritative desk", () => {
    const rows = [state({ symbol: "IRE" }), state({ symbol: "YMAT" })];
    expect(monitoringStates(rows).map((r) => r.symbol)).toEqual(["IRE", "YMAT"]);
    expect(monitoringStates(rows, ["IRE"]).map((r) => r.symbol)).toEqual(["YMAT"]);
  });

  it("never lists a name that did not previously occupy the desk", () => {
    const rows = [state({ symbol: "NEW", ever_on_desk: false, monitoring_eligible: true })];
    expect(monitoringStates(rows)).toEqual([]);
  });
});
