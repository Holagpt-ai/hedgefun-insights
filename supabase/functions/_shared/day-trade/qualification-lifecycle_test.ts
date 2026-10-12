import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  emptyQualificationEpisodeState,
  isDayTradeQualificationMonitoringCandidate,
  stepDayTradeQualificationLifecycle,
  type DayTradeQualificationEvaluation,
} from "./qualification-lifecycle.ts";

const SESSION = "2026-10-12";

function evalBase(overrides: Partial<DayTradeQualificationEvaluation>): DayTradeQualificationEvaluation {
  return {
    symbol: overrides.symbol ?? "TEST",
    evaluable: true,
    fivePillarsPass: true,
    pillarOutcomes: {
      price: "pass",
      move: "pass",
      float: "pass",
      participation: "pass",
      freshness: "pass",
    },
    reasonCodes: [],
    marketDataMs: 1_000,
    snapshotKey: "a",
    monitoredPrice: 5,
    monitoredVolume: 1_000_000,
    providerAsOfIso: "2026-10-12T08:49:00.000Z",
    onAuthoritativeDesk: false,
    freshnessPass: true,
    opportunityEligible: true,
    deskObservationComplete: true,
    ...overrides,
  };
}

Deno.test("IRE reconstructed: desk loss on freshness, pillars stay ACTIVE", () => {
  let state = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "IRE" });
  state = stepDayTradeQualificationLifecycle(
    state,
    evalBase({
      symbol: "IRE",
      marketDataMs: 1_000,
      snapshotKey: "ire-1",
      onAuthoritativeDesk: true,
    }),
  ).state;
  assertEquals(state.currentlyOnDesk, true);
  assertEquals(state.pillarPhase, "ACTIVE");

  state = stepDayTradeQualificationLifecycle(
    state,
    evalBase({
      symbol: "IRE",
      marketDataMs: 70_000,
      snapshotKey: "ire-2",
      onAuthoritativeDesk: false,
      freshnessPass: false,
      fivePillarsPass: true,
    }),
  ).state;
  assertEquals(state.pillarPhase, "ACTIVE");
  assertEquals(isDayTradeQualificationMonitoringCandidate(state), true);
  assertEquals(state.lastDeskDepartureReason, "FRESHNESS_DISQUALIFIED");
});

Deno.test("missing required value: no false expiration", () => {
  let state = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "X" });
  state = stepDayTradeQualificationLifecycle(
    state,
    evalBase({ onAuthoritativeDesk: true, marketDataMs: 1_000, snapshotKey: "x1" }),
  ).state;
  const r = stepDayTradeQualificationLifecycle(
    state,
    evalBase({
      evaluable: false,
      unevaluableReason: "missing_data",
      fivePillarsPass: false,
      snapshotKey: "x2",
      marketDataMs: 2_000,
    }),
  );
  assertEquals(r.state.pillarPhase, "ACTIVE");
  assertEquals(r.events.length, 0);
});

Deno.test("equal-ms dual writers cannot exit a seated name", () => {
  let state = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "FLK" });
  state = stepDayTradeQualificationLifecycle(
    state,
    evalBase({
      symbol: "FLK",
      marketDataMs: 1_000,
      snapshotKey: "sync:flk",
      onAuthoritativeDesk: true,
    }),
  ).state;
  const exit = stepDayTradeQualificationLifecycle(
    state,
    evalBase({
      symbol: "FLK",
      marketDataMs: 1_000,
      snapshotKey: "v22:flk",
      onAuthoritativeDesk: false,
    }),
  );
  assertEquals(exit.events.length, 0);
  assertEquals(exit.state.currentlyOnDesk, true);
});

Deno.test("incomplete observation cannot authorize a desk exit", () => {
  let state = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "PRT" });
  state = stepDayTradeQualificationLifecycle(
    state,
    evalBase({
      symbol: "PRT",
      marketDataMs: 1_000,
      snapshotKey: "v22:1",
      onAuthoritativeDesk: true,
    }),
  ).state;
  const incomplete = stepDayTradeQualificationLifecycle(
    state,
    evalBase({
      symbol: "PRT",
      marketDataMs: 80_000,
      snapshotKey: "sync:partial",
      onAuthoritativeDesk: false,
      deskObservationComplete: false,
    }),
  );
  assertEquals(incomplete.events.length, 0);
  assertEquals(incomplete.state.currentlyOnDesk, true);
});

Deno.test("duplicate and out-of-order snapshots ignored", () => {
  let state = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "D" });
  state = stepDayTradeQualificationLifecycle(
    state,
    evalBase({ onAuthoritativeDesk: true, marketDataMs: 5_000, snapshotKey: "d1" }),
  ).state;
  assertEquals(
    stepDayTradeQualificationLifecycle(
      state,
      evalBase({ fivePillarsPass: false, marketDataMs: 6_000, snapshotKey: "d1" }),
    ).events.length,
    0,
  );
  assertEquals(
    stepDayTradeQualificationLifecycle(
      state,
      evalBase({ fivePillarsPass: false, marketDataMs: 4_000, snapshotKey: "d0" }),
    ).events.length,
    0,
  );
});
