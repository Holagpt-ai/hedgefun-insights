import { describe, expect, it } from "vitest";
import { microsToNumber, parseDecimal } from "./decimal";
import { calculateTrade } from "./engine";
import { computePlannedRiskFromPlan, computeRiskPerShare, resolveInitialRisk } from "./planned-risk";
import { AUGUST_14_TRADES } from "../demo/august-fixtures";

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
    expect(Number(microsToNumber(risk!).toFixed(2))).toBe(210);
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

  it("resolves the canonical NVDA demo trade from plan inputs", () => {
    const nvda = AUGUST_14_TRADES.find((trade) => trade.id === "demo-nvda")!;
    const resolved = resolveInitialRisk(nvda);
    expect(resolved.source).toBe("plan_inputs");
    expect(microsToNumber(resolved.initialRisk!)).toBe(210);
    const calc = calculateTrade(nvda);
    expect(microsToNumber(calc.initialRisk!)).toBe(210);
    expect(calc.rMultiple).toBeCloseTo(440 / 210, 10);
  });
});
