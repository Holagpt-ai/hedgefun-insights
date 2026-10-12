import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  emptyQualificationEpisodeState,
  isDayTradeQualificationMonitoringCandidate,
  stepDayTradeQualificationLifecycle,
  type DayTradeQualificationEvaluation,
} from "./qualification-lifecycle.ts";

const SESSION = "2026-10-12";
const SYMBOL = "TEST";

function passEval(marketDataMs: number, snapshotKey: string): DayTradeQualificationEvaluation {
  return {
    symbol: SYMBOL,
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
    marketDataMs,
    snapshotKey,
    monitoredPrice: 5,
    monitoredVolume: 1_000_000,
    providerAsOfIso: new Date(marketDataMs).toISOString(),
  };
}

function failEval(marketDataMs: number, snapshotKey: string): DayTradeQualificationEvaluation {
  return {
    symbol: SYMBOL,
    evaluable: true,
    fivePillarsPass: false,
    pillarOutcomes: {
      price: "pass",
      move: "fail",
      float: "pass",
      participation: "pass",
      freshness: "pass",
    },
    reasonCodes: ["MOMENTUM_TOO_WEAK"],
    marketDataMs,
    snapshotKey,
    monitoredPrice: 4.5,
    monitoredVolume: 900_000,
    providerAsOfIso: new Date(marketDataMs).toISOString(),
  };
}

Deno.test("qualified → one failure → recovery without expiration", () => {
  let state = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: SYMBOL });
  let r = stepDayTradeQualificationLifecycle(state, passEval(1_000, "a"), 1_000);
  state = r.state;
  assertEquals(r.events.map((e) => e.type), ["QUALIFIED"]);
  assertEquals(state.phase, "ACTIVE");

  r = stepDayTradeQualificationLifecycle(state, failEval(70_000, "b"), 70_000);
  state = r.state;
  assertEquals(state.phase, "GRACE");
  assertEquals(r.events.some((e) => e.type === "GRACE_ENTERED"), true);

  r = stepDayTradeQualificationLifecycle(state, passEval(80_000, "c"), 80_000);
  state = r.state;
  assertEquals(state.phase, "ACTIVE");
  assertEquals(r.events.some((e) => e.type === "RECOVERED"), true);
  assertEquals(isDayTradeQualificationMonitoringCandidate(state), false);
});

Deno.test("qualified → two valid failures → expired and monitored", () => {
  let state = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: SYMBOL });
  let r = stepDayTradeQualificationLifecycle(state, passEval(1_000, "a"), 1_000);
  state = r.state;
  r = stepDayTradeQualificationLifecycle(state, failEval(70_000, "b"), 70_000);
  state = r.state;
  r = stepDayTradeQualificationLifecycle(state, failEval(70_000 + 60_000, "c"), 130_000);
  state = r.state;
  assertEquals(state.phase, "EXPIRED");
  assertEquals(r.events.some((e) => e.type === "EXPIRED"), true);
  assertEquals(isDayTradeQualificationMonitoringCandidate(state), true);
});

Deno.test("expired → renewed pass → active requalification", () => {
  let state = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: SYMBOL });
  let r = stepDayTradeQualificationLifecycle(state, passEval(1_000, "a"), 1_000);
  state = r.state;
  r = stepDayTradeQualificationLifecycle(state, failEval(70_000, "b"), 70_000);
  state = r.state;
  r = stepDayTradeQualificationLifecycle(state, failEval(130_000, "c"), 130_000);
  state = r.state;
  assertEquals(state.phase, "EXPIRED");

  r = stepDayTradeQualificationLifecycle(state, passEval(200_000, "d"), 200_000);
  state = r.state;
  assertEquals(state.phase, "ACTIVE");
  assertEquals(r.events.some((e) => e.type === "REQUALIFIED"), true);
  assertEquals(state.priorEpisodes.length, 1);
});

Deno.test("provider outage → no false expiration", () => {
  let state = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: SYMBOL });
  let r = stepDayTradeQualificationLifecycle(state, passEval(1_000, "a"), 1_000);
  state = r.state;
  const outage: DayTradeQualificationEvaluation = {
    ...failEval(70_000, "b"),
    evaluable: false,
    unevaluableReason: "provider_outage",
  };
  r = stepDayTradeQualificationLifecycle(state, outage, 70_000);
  assertEquals(r.state.phase, "ACTIVE");
  assertEquals(r.events.length, 0);
});

Deno.test("duplicate snapshot → no grace advance", () => {
  let state = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: SYMBOL });
  let r = stepDayTradeQualificationLifecycle(state, passEval(1_000, "same"), 1_000);
  state = r.state;
  r = stepDayTradeQualificationLifecycle(state, failEval(70_000, "same"), 70_000);
  assertEquals(r.state.phase, "ACTIVE");
  assertEquals(r.events.length, 0);
});

Deno.test("IRE Oct 12: freshness-only desk drop must not expire Five Pillars", () => {
  let state = emptyQualificationEpisodeState({ sessionDate: SESSION, symbol: "IRE" });
  let r = stepDayTradeQualificationLifecycle(state, passEval(1_000, "ire-a"), 1_000);
  state = r.state;
  const stillQualifiedMomentum: DayTradeQualificationEvaluation = {
    ...passEval(120_000, "ire-b"),
    pillarOutcomes: {
      price: "pass",
      move: "pass",
      float: "pass",
      participation: "pass",
      freshness: "fail",
    },
  };
  r = stepDayTradeQualificationLifecycle(state, stillQualifiedMomentum, 120_000);
  assertEquals(r.state.phase, "ACTIVE");
  assertEquals(r.events.length, 0);
});
