import { describe, expect, it } from "vitest";
import {
  emptyQualificationEpisodeState,
  stepDayTradeQualificationLifecycle,
} from "../../../../supabase/functions/_shared/day-trade/qualification-lifecycle.ts";
import {
  episodeStateToRow,
  stateRowToEpisode,
} from "../../../../supabase/functions/_shared/day-trade/persist-qualification-lifecycle.ts";

describe("day trade qualification lifecycle persistence", () => {
  it("preserves v42.1 episode fields across round-trip", () => {
    const state = emptyQualificationEpisodeState({
      sessionDate: "2026-10-12",
      symbol: "IRE",
    });
    state.pillarPhase = "ACTIVE";
    state.everOnDesk = true;
    state.currentlyOnDesk = false;
    state.monitoringEligible = true;
    state.lastDeskDepartureReason = "FRESHNESS_DISQUALIFIED";
    const restored = stateRowToEpisode(episodeStateToRow(state));
    expect(restored.symbol).toBe("IRE");
    expect(restored.lastDeskDepartureReason).toBe("FRESHNESS_DISQUALIFIED");
  });

  it("duplicate worker runs do not duplicate QUALIFIED events", () => {
    let state = emptyQualificationEpisodeState({ sessionDate: "2026-10-12", symbol: "IRE" });
    const pass = {
      symbol: "IRE",
      evaluable: true,
      fivePillarsPass: true,
      pillarOutcomes: {
        price: "pass",
        move: "pass",
        float: "pass",
        participation: "pass",
        freshness: "pass",
      } as const,
      reasonCodes: [],
      marketDataMs: 1_000,
      snapshotKey: "gen-1:IRE:t1",
      monitoredPrice: 4,
      monitoredVolume: 100,
      providerAsOfIso: "2026-10-12T08:49:00.000Z",
      onAuthoritativeDesk: true,
      freshnessPass: true,
      opportunityEligible: true,
      deskObservationComplete: true,
    };
    state = stepDayTradeQualificationLifecycle(state, pass).state;
    const second = stepDayTradeQualificationLifecycle(state, {
      ...pass,
      snapshotKey: "gen-2:IRE:t2",
      marketDataMs: 2_000,
      onAuthoritativeDesk: true,
    });
    expect(second.events.filter((e) => e.type === "QUALIFIED")).toHaveLength(0);
  });
});
