import { describe, expect, it } from "vitest";
import { microsToNumber, parseDecimal } from "./decimal";
import { calculateTrade } from "./engine";
import { computePlannedRiskFromPlan, computeRiskPerShare, resolveInitialRisk } from "./planned-risk";
import { formatR } from "../lib/format";
import { AUGUST_14_TRADES } from "../demo/august-fixtures";

function byId(id: string) {
  return AUGUST_14_TRADES.find((trade) => trade.id === id)!;
}

describe("planned risk from plan inputs", () => {
  it("derives NVDA planned risk as exactly $210.00", () => {
    const risk = computePlannedRiskFromPlan({
      assetClass: "stock",
      plannedEntry: "118.40",
      plannedStop: "116.30",
      plannedSize: 100,
    });
    expect(risk).toBe(parseDecimal("210.00"));
    expect(microsToNumber(risk!)).toBe(210);
  });

  it("never lets a disagreeing stored plannedRisk override complete plan inputs", () => {
    const nvda = byId("demo-nvda");
    const poisoned = { ...nvda, plannedRisk: "209.52380952" };
    const resolved = resolveInitialRisk(poisoned);
    expect(resolved.source).toBe("plan_inputs");
    expect(resolved.initialRisk).toBe(parseDecimal("210"));
    expect(microsToNumber(resolved.initialRisk!)).not.toBe(209.52380952);

    const calc = calculateTrade(poisoned);
    expect(calc.plannedRiskSource).toBe("plan_inputs");
    expect(microsToNumber(calc.initialRisk!)).toBe(210);
    expect(formatR(calc.rMultiple)).toBe("2.10R");
  });

  it("uses abs(entry − stop) × quantity and never a target R", () => {
    const perShare = computeRiskPerShare({
      assetClass: "stock",
      plannedEntry: 118.4,
      plannedStop: 116.3,
      plannedSize: 100,
    });
    expect(microsToNumber(perShare!)).toBe(2.1);
    const backSolved = parseDecimal((440 / 2.1).toString());
    expect(computePlannedRiskFromPlan({
      assetClass: "stock",
      plannedEntry: 118.4,
      plannedStop: 116.3,
      plannedSize: 100,
    })).not.toBe(backSolved);
  });

  it("resolves NVDA, SPY, AAPL, and TSLA from plan inputs", () => {
    const nvda = calculateTrade(byId("demo-nvda"));
    expect(nvda.plannedRiskSource).toBe("plan_inputs");
    expect(microsToNumber(nvda.initialRisk!)).toBe(210);
    expect(formatR(nvda.rMultiple)).toBe("2.10R");

    const spy = calculateTrade(byId("demo-spy-450c"));
    expect(spy.plannedRiskSource).toBe("plan_inputs");
    expect(microsToNumber(spy.initialRisk!)).toBe(210);
    expect(spy.rMultiple).toBeCloseTo(650 / 210, 10);
    expect(formatR(spy.rMultiple)).toBe("3.10R");

    const aapl = calculateTrade(byId("demo-aapl"));
    expect(aapl.plannedRiskSource).toBe("plan_inputs");
    expect(microsToNumber(aapl.initialRisk!)).toBe(92);
    expect(aapl.rMultiple).toBeCloseTo(120 / 92, 10);
    expect(formatR(aapl.rMultiple)).toBe("1.30R");

    const tsla = calculateTrade(byId("demo-tsla"));
    expect(tsla.plannedRiskSource).toBe("plan_inputs");
    expect(microsToNumber(tsla.initialRisk!)).toBe(133);
    expect(tsla.rMultiple).toBeCloseTo(40 / 133, 10);
    expect(formatR(tsla.rMultiple)).toBe("0.30R");
  });

  it("uses stored planned risk for PLTR because plan inputs are incomplete", () => {
    const pltr = byId("demo-pltr");
    expect(pltr.plannedEntry == null || pltr.plannedEntry === "").toBe(true);
    expect(pltr.plannedStop == null || pltr.plannedStop === "").toBe(true);
    const resolved = resolveInitialRisk(pltr);
    expect(resolved.source).toBe("stored_planned_risk");
    expect(microsToNumber(resolved.initialRisk!)).toBeCloseTo(216.66666667, 5);
    const calc = calculateTrade(pltr);
    expect(calc.plannedRiskSource).toBe("stored_planned_risk");
    expect(formatR(calc.rMultiple)).toBe("-0.60R");
  });
});
