import { describe, expect, it } from "vitest";
import { aggregateTrades, calculateTrade } from "./engine";
import { averageProcessScore, calculateProcessScore, PROCESS_SCORE_VERSION } from "./process-score";
import { formatAverageR } from "../lib/format";
import { microsToNumber } from "./decimal";
import { AUGUST_14_TRADES, AUGUST_CLOSED_TRADES, AUGUST_DEMO_TRADES } from "../demo/august-fixtures";

function dollars(value: bigint): number {
  return Number(microsToNumber(value).toFixed(2));
}

function byId(id: string) {
  return AUGUST_14_TRADES.find((trade) => trade.id === id)!;
}

function riskComponent(tradeId: string) {
  const result = calculateProcessScore(byId(tradeId));
  return result.components.find((item) => item.key === "risk");
}

describe("process score risk source", () => {
  it("uses process-score.v1.1 after plan-derived risk resolution", () => {
    expect(PROCESS_SCORE_VERSION).toBe("process-score.v1.1");
    expect(calculateProcessScore(byId("demo-nvda")).version).toBe("process-score.v1.1");
  });

  it("scores NVDA 89 from plan-derived $210 risk without stored plannedRisk", () => {
    const nvda = byId("demo-nvda");
    expect(nvda.plannedRisk == null || nvda.plannedRisk === "").toBe(true);
    const calc = calculateTrade(nvda);
    expect(microsToNumber(calc.initialRisk!)).toBe(210);
    expect(calc.plannedRiskSource).toBe("plan_inputs");

    const result = calculateProcessScore(nvda);
    expect(result.total).toBe(89);
    const risk = result.components.find((item) => item.key === "risk");
    expect(risk?.score).toBe(100);
  });

  it("does not penalize SPY, AAPL, or TSLA for plan-derived risk", () => {
    for (const id of ["demo-spy-450c", "demo-aapl", "demo-tsla"] as const) {
      const trade = byId(id);
      expect(trade.plannedRisk == null || trade.plannedRisk === "").toBe(true);
      const calc = calculateTrade(trade);
      expect(calc.plannedRiskSource).toBe("plan_inputs");
      expect(calc.initialRisk != null && calc.initialRisk > 0n).toBe(true);
      expect(riskComponent(id)?.score).toBe(100);
    }
  });

  it("ignores a poisoned stored plannedRisk on a complete plan", () => {
    const nvda = byId("demo-nvda");
    const poisoned = { ...nvda, plannedRisk: "209.52380952" };
    expect(calculateProcessScore(poisoned).total).toBe(calculateProcessScore(nvda).total);
    expect(calculateProcessScore(poisoned).components.find((item) => item.key === "risk")?.score).toBe(100);
  });

  it("recognizes PLTR stored-risk fallback as defined risk", () => {
    const pltr = byId("demo-pltr");
    const calc = calculateTrade(pltr);
    expect(calc.plannedRiskSource).toBe("stored_planned_risk");
    expect(calc.initialRisk != null && calc.initialRisk > 0n).toBe(true);
    const risk = riskComponent("demo-pltr");
    expect(risk?.score).toBe(40);
  });

  it("gives no defined-risk credit for missing or zero risk", () => {
    const nvda = byId("demo-nvda");
    const missing = {
      ...nvda,
      plannedEntry: null,
      plannedStop: null,
      plannedSize: null,
      plannedRisk: null,
    };
    expect(calculateProcessScore(missing).components.find((item) => item.key === "risk")?.score).toBe(30);

    const zero = {
      ...nvda,
      plannedStop: nvda.plannedEntry,
      plannedRisk: null,
    };
    const zeroRisk = calculateProcessScore(zero).components.find((item) => item.key === "risk");
    expect(zeroRisk?.score).toBe(60);

    const negative = {
      ...nvda,
      plannedEntry: null,
      plannedStop: null,
      plannedSize: null,
      plannedRisk: "-10",
    };
    expect(calculateProcessScore(negative).components.find((item) => item.key === "risk")?.score).toBe(30);
  });

  it("resolves the 17-trade Overview process score to 74", () => {
    expect(AUGUST_DEMO_TRADES).toHaveLength(17);
    expect(averageProcessScore(AUGUST_DEMO_TRADES)).toBe(74);
  });

  it("does not change locked financial results", () => {
    const session = aggregateTrades(AUGUST_14_TRADES);
    expect(dollars(session.grossPnl)).toBe(1158);
    expect(dollars(session.fees)).toBe(38);
    expect(dollars(session.netPnl)).toBe(1120);
    expect(formatAverageR(session.averageR)).toBe("+1.24R");

    const month = aggregateTrades(AUGUST_CLOSED_TRADES);
    expect(dollars(month.netPnl)).toBe(4150);
    expect(formatAverageR(month.averageR)).toBe("+0.87R");
  });
});
