import { describe, expect, it } from "vitest";
import {
  emptyQualificationEpisodeState,
  isDayTradeQualificationMonitoringCandidate,
  stepDayTradeQualificationLifecycle,
  type DayTradeQualificationEvaluation,
} from "../../../../supabase/functions/_shared/day-trade/qualification-lifecycle.ts";
import {
  episodeStateToRow,
  stateRowToEpisode,
  QualificationPersistenceError,
  loadQualificationStatesForSession,
} from "../../../../supabase/functions/_shared/day-trade/persist-qualification-lifecycle.ts";

const SESSION = "2026-10-12";

function tick(overrides: Partial<DayTradeQualificationEvaluation>): DayTradeQualificationEvaluation {
  return {
    symbol: "SYM",
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
    snapshotKey: "k1",
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

function onDesk(ms: number, key: string, symbol = "SYM") {
  return tick({ symbol, marketDataMs: ms, snapshotKey: key, onAuthoritativeDesk: true });
}

describe("V42.1 lifecycle scenarios", () => {
  it("1. IRE reconstructed: on desk then freshness loss → monitoring, not pillar EXPIRED", () => {
    let s = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "IRE" });
    s = stepDayTradeQualificationLifecycle(s, onDesk(1_000, "ire-1", "IRE")).state;
    s = stepDayTradeQualificationLifecycle(
      s,
      tick({
        symbol: "IRE",
        marketDataMs: 120_000,
        snapshotKey: "ire-2",
        onAuthoritativeDesk: false,
        freshnessPass: false,
        fivePillarsPass: true,
      }),
    ).state;
    expect(s.pillarPhase).toBe("ACTIVE");
    expect(s.lastDeskDepartureReason).toBe("FRESHNESS_DISQUALIFIED");
    expect(isDayTradeQualificationMonitoringCandidate(s)).toBe(true);
  });

  it("2. YMAT remains on desk → not monitoring", () => {
    let s = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "YMAT" });
    s = stepDayTradeQualificationLifecycle(s, onDesk(1_000, "ymat-1", "YMAT")).state;
    s = stepDayTradeQualificationLifecycle(
      s,
      onDesk(60_000, "ymat-2", "YMAT"),
    ).state;
    expect(isDayTradeQualificationMonitoringCandidate(s)).toBe(false);
  });

  it("3. Top-10 displacement → monitoring with distinct reason", () => {
    let s = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "AAA" });
    s = stepDayTradeQualificationLifecycle(s, onDesk(1_000, "a1", "AAA")).state;
    s = stepDayTradeQualificationLifecycle(
      s,
      tick({
        symbol: "AAA",
        marketDataMs: 90_000,
        snapshotKey: "a2",
        onAuthoritativeDesk: false,
        freshnessPass: true,
        opportunityEligible: true,
        fivePillarsPass: true,
      }),
    ).state;
    expect(s.lastDeskDepartureReason).toBe("TOP10_DISPLACED");
  });

  it("4. Pillar expired then full recovery → REQUALIFIED", () => {
    let s = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "BBB" });
    s = stepDayTradeQualificationLifecycle(s, onDesk(1_000, "b1", "BBB")).state;
    s = stepDayTradeQualificationLifecycle(
      s,
      tick({
        symbol: "BBB",
        marketDataMs: 70_000,
        snapshotKey: "b2",
        fivePillarsPass: false,
        onAuthoritativeDesk: false,
        reasonCodes: ["MOMENTUM_TOO_WEAK"],
        pillarOutcomes: {
          price: "pass",
          move: "fail",
          float: "pass",
          participation: "pass",
          freshness: "pass",
        },
      }),
    ).state;
    s = stepDayTradeQualificationLifecycle(
      s,
      tick({
        symbol: "BBB",
        marketDataMs: 130_000,
        snapshotKey: "b3",
        fivePillarsPass: false,
        onAuthoritativeDesk: false,
        reasonCodes: ["MOMENTUM_TOO_WEAK"],
        pillarOutcomes: {
          price: "pass",
          move: "fail",
          float: "pass",
          participation: "pass",
          freshness: "pass",
        },
      }),
    ).state;
    expect(s.pillarPhase).toBe("EXPIRED");
    const back = stepDayTradeQualificationLifecycle(
      s,
      tick({
        symbol: "BBB",
        marketDataMs: 200_000,
        snapshotKey: "b4",
        onAuthoritativeDesk: true,
        fivePillarsPass: true,
      }),
    );
    expect(back.events.some((e) => e.type === "REQUALIFIED")).toBe(true);
    expect(back.state.currentlyOnDesk).toBe(true);
  });

  it("5. Valid pillars, desk-only loss → DESK_REENTERED without REQUALIFIED", () => {
    let s = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "CCC" });
    s = stepDayTradeQualificationLifecycle(s, onDesk(1_000, "c1", "CCC")).state;
    s = stepDayTradeQualificationLifecycle(
      s,
      tick({
        symbol: "CCC",
        marketDataMs: 80_000,
        snapshotKey: "c2",
        onAuthoritativeDesk: false,
        freshnessPass: false,
      }),
    ).state;
    const back = stepDayTradeQualificationLifecycle(
      s,
      tick({
        symbol: "CCC",
        marketDataMs: 140_000,
        snapshotKey: "c3",
        onAuthoritativeDesk: true,
        freshnessPass: true,
      }),
    );
    expect(back.events.some((e) => e.type === "DESK_REENTERED")).toBe(true);
    expect(back.events.some((e) => e.type === "REQUALIFIED")).toBe(false);
  });

  it("6. Missing required → no false expiration", () => {
    let s = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "DDD" });
    s = stepDayTradeQualificationLifecycle(s, onDesk(1_000, "d1", "DDD")).state;
    const r = stepDayTradeQualificationLifecycle(
      s,
      tick({ evaluable: false, unevaluableReason: "missing_data", fivePillarsPass: false, snapshotKey: "d2", marketDataMs: 2_000 }),
    );
    expect(r.state.pillarPhase).toBe("ACTIVE");
  });

  it("8. Duplicate snapshot → no repeated transitions", () => {
    let s = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "F" });
    s = stepDayTradeQualificationLifecycle(s, onDesk(1_000, "same", "F")).state;
    expect(
      stepDayTradeQualificationLifecycle(
        s,
        tick({ fivePillarsPass: false, snapshotKey: "same", marketDataMs: 2_000, symbol: "F" }),
      ).events.length,
    ).toBe(0);
  });

  it("9. Failed database read throws — not empty history", async () => {
    await expect(
      loadQualificationStatesForSession(
        {
          rpc: async () => ({ data: null, error: { message: "boom" } }),
        },
        SESSION,
      ),
    ).rejects.toBeInstanceOf(QualificationPersistenceError);
  });

  it("grace pillar failure labels desk exit as PILLARS_IN_GRACE not PILLAR_EXPIRED", () => {
    let s = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "G" });
    s = stepDayTradeQualificationLifecycle(s, onDesk(1_000, "g1", "G")).state;
    s = stepDayTradeQualificationLifecycle(
      s,
      tick({
        symbol: "G",
        marketDataMs: 70_000,
        snapshotKey: "g2",
        onAuthoritativeDesk: false,
        fivePillarsPass: false,
        reasonCodes: ["MOMENTUM_TOO_WEAK"],
        pillarOutcomes: {
          price: "pass",
          move: "fail",
          float: "pass",
          participation: "pass",
          freshness: "pass",
        },
      }),
    ).state;
    expect(s.pillarPhase).toBe("GRACE");
    expect(s.lastDeskDepartureReason).toBe("PILLARS_IN_GRACE");
  });

  it("equal market-data timestamp cannot exit then re-enter the desk", () => {
    let s = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "FLK" });
    s = stepDayTradeQualificationLifecycle(s, onDesk(1_000, "sync:flk", "FLK")).state;
    const exit = stepDayTradeQualificationLifecycle(
      s,
      tick({
        symbol: "FLK",
        marketDataMs: 1_000,
        snapshotKey: "v22:flk",
        onAuthoritativeDesk: false,
      }),
    );
    expect(exit.events.some((e) => e.type === "DESK_EXITED")).toBe(false);
    expect(exit.state.currentlyOnDesk).toBe(true);
    expect(isDayTradeQualificationMonitoringCandidate(exit.state)).toBe(false);
  });

  it("incomplete desk generation does not authorize an exit", () => {
    let s = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "PRT" });
    s = stepDayTradeQualificationLifecycle(s, onDesk(1_000, "v22:1", "PRT")).state;
    const incomplete = stepDayTradeQualificationLifecycle(
      s,
      tick({
        symbol: "PRT",
        marketDataMs: 80_000,
        snapshotKey: "sync:partial",
        onAuthoritativeDesk: false,
        deskObservationComplete: false,
      }),
    );
    expect(incomplete.events.some((e) => e.type === "DESK_EXITED")).toBe(false);
    expect(incomplete.state.currentlyOnDesk).toBe(true);
    expect(isDayTradeQualificationMonitoringCandidate(incomplete.state)).toBe(false);
  });

  it("equal-ms complete observation can seat a name that never occupied the desk", () => {
    const s = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "NEW" });
    const first = stepDayTradeQualificationLifecycle(
      s,
      tick({
        symbol: "NEW",
        marketDataMs: 1_000,
        snapshotKey: "sync:new",
        onAuthoritativeDesk: false,
        deskObservationComplete: false,
      }),
    );
    expect(first.state.everOnDesk).toBe(false);
    const seated = stepDayTradeQualificationLifecycle(
      first.state,
      onDesk(1_000, "v22:new", "NEW"),
    );
    expect(seated.events.some((e) => e.type === "DESK_ENTERED")).toBe(true);
    expect(seated.state.currentlyOnDesk).toBe(true);
  });

  it("later market tick still allows legitimate re-entry", () => {
    let s = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "LEG" });
    s = stepDayTradeQualificationLifecycle(s, onDesk(1_000, "l1", "LEG")).state;
    s = stepDayTradeQualificationLifecycle(
      s,
      tick({
        symbol: "LEG",
        marketDataMs: 80_000,
        snapshotKey: "l2",
        onAuthoritativeDesk: false,
        freshnessPass: false,
      }),
    ).state;
    expect(isDayTradeQualificationMonitoringCandidate(s)).toBe(true);
    const back = stepDayTradeQualificationLifecycle(s, onDesk(140_000, "l3", "LEG"));
    expect(back.events.some((e) => e.type === "DESK_REENTERED")).toBe(true);
    expect(isDayTradeQualificationMonitoringCandidate(back.state)).toBe(false);
  });

  it("keeps grace until a second market-data failure is 60s later", () => {
    let s = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "HOLD" });
    s = stepDayTradeQualificationLifecycle(s, onDesk(1_000, "h1", "HOLD")).state;
    expect(s.pillarPhase).toBe("ACTIVE");
    const fail = (ms: number, key: string) =>
      tick({
        symbol: "HOLD",
        marketDataMs: ms,
        snapshotKey: key,
        onAuthoritativeDesk: false,
        fivePillarsPass: false,
        pillarOutcomes: {
          price: "fail",
          move: "pass",
          float: "pass",
          participation: "pass",
          freshness: "pass",
        },
        reasonCodes: ["price"],
      });
    s = stepDayTradeQualificationLifecycle(s, fail(2_000, "h2")).state;
    expect(s.pillarPhase).toBe("GRACE");
    s = stepDayTradeQualificationLifecycle(s, fail(32_000, "h3")).state;
    expect(s.pillarPhase).toBe("GRACE");
    expect(s.monitoringEligible).toBe(true);
    s = stepDayTradeQualificationLifecycle(s, fail(63_000, "h4")).state;
    expect(s.pillarPhase).toBe("EXPIRED");
  });

  it("persistence round-trip preserves desk fields", () => {
    const state = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "IRE" });
    state.everOnDesk = true;
    state.lastDeskDepartureReason = "FRESHNESS_DISQUALIFIED";
    state.monitoringEligible = true;
    const row = episodeStateToRow(state);
    const restored = stateRowToEpisode(row);
    expect(restored.lastDeskDepartureReason).toBe("FRESHNESS_DISQUALIFIED");
    expect(restored.monitoringEligible).toBe(true);
  });
});
