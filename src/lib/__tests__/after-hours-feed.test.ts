import { describe, expect, it } from "vitest";
import { viewAfterHoursGeneration, type AfterHoursFeedState, type AfterHoursMoverResult } from "@/lib/after-hours-feed";

const NOW = Date.parse("2026-08-12T23:00:00.000Z");
const SYNCED = "2026-08-12T22:50:00.000Z";
const GEN = "11111111-1111-4111-8111-111111111111";

function state(overrides: Partial<AfterHoursFeedState> = {}): AfterHoursFeedState {
  return {
    state_key: "current",
    generation_id: GEN,
    status: "available",
    session_date: "2026-08-12",
    synced_at: SYNCED,
    provider_as_of_min: SYNCED,
    provider_as_of_max: SYNCED,
    gainer_count: 1,
    loser_count: 0,
    updated_at: SYNCED,
    ...overrides,
  };
}

function row(overrides: Partial<AfterHoursMoverResult> = {}): AfterHoursMoverResult {
  return {
    generation_id: GEN,
    side: "gainer",
    rank: 1,
    symbol: "AAA",
    company_name: "Aaa",
    extended_last: 11,
    regular_close: 10,
    change_percent: 10,
    change_amount: 1,
    volume: 1_000_000,
    observation_source: "lastTrade",
    provider_as_of: SYNCED,
    updated_at: SYNCED,
    ...overrides,
  };
}

describe("after-hours feed view", () => {
  it("shows a validated full-market generation", () => {
    const view = viewAfterHoursGeneration([state()], [row()], NOW);
    expect(view.status).toBe("available");
    expect(view.gainers).toHaveLength(1);
    expect(view.sessionDate).toBe("2026-08-12");
  });

  it("preserves an empty validated generation", () => {
    const view = viewAfterHoursGeneration(
      [state({ status: "empty", gainer_count: 0, loser_count: 0, provider_as_of_min: null, provider_as_of_max: null })],
      [],
      NOW,
    );
    expect(view.status).toBe("empty");
    expect(view.gainers).toHaveLength(0);
  });

  it("does not fabricate rows when the generation is missing", () => {
    const view = viewAfterHoursGeneration([], [], NOW);
    expect(view.status).toBe("unavailable");
    expect(view.gainers).toHaveLength(0);
    expect(view.losers).toHaveLength(0);
  });
});
