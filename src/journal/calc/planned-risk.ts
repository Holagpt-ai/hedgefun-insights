import { abs, MONEY_SCALE, parseDecimal, sub, type Micros } from "./decimal";
import type { PlannedRiskSource, TradeInput } from "./types";

export type PlannedRiskInputs = Pick<
  TradeInput,
  "plannedEntry" | "plannedStop" | "plannedSize" | "assetClass" | "legs"
>;

export interface PlannedRiskResolution {
  initialRisk: Micros | null;
  riskPerShare: Micros | null;
  plannedQuantity: Micros | null;
  plannedEntry: Micros | null;
  plannedStop: Micros | null;
  multiplier: bigint;
  source: PlannedRiskSource;
}

function unscaled(value: Micros): bigint {
  return value / MONEY_SCALE;
}

export function planMultiplier(trade: PlannedRiskInputs): bigint {
  const raw = trade.legs?.[0]?.multiplier ?? (trade.assetClass === "equity_option" ? 100 : 1);
  return unscaled(parseDecimal(raw)) || 1n;
}

function optionalDecimal(value: number | string | null | undefined): Micros | null {
  if (value === undefined || value === null || value === "") return null;
  return parseDecimal(value);
}

/** abs(planned entry − planned stop). Never derived from a target R. */
export function computeRiskPerShare(trade: PlannedRiskInputs): Micros | null {
  const entry = optionalDecimal(trade.plannedEntry);
  const stop = optionalDecimal(trade.plannedStop);
  if (entry == null || stop == null) return null;
  return abs(sub(entry, stop));
}

/**
 * Authoritative planned risk from plan inputs:
 * abs(entry − stop) × quantity × multiplier.
 */
export function computePlannedRiskFromPlan(trade: PlannedRiskInputs): Micros | null {
  const riskPerShare = computeRiskPerShare(trade);
  const quantity = optionalDecimal(trade.plannedSize);
  if (riskPerShare == null || quantity == null) return null;
  const multiplier = planMultiplier(trade);
  return (riskPerShare * quantity * multiplier) / MONEY_SCALE;
}

/**
 * Resolve the R denominator.
 * Plan inputs are authoritative when they produce a risk amount.
 * A stored plannedRisk is used only when plan inputs are incomplete, or when it
 * exactly matches the plan-derived amount (input contract already in sync).
 * Stored values that disagree with plan inputs remain the R denominator so
 * locked demo averages are not rewritten from a back-solved R, but are labeled
 * `stored_planned_risk` for audit.
 */
export function resolveInitialRisk(trade: TradeInput): PlannedRiskResolution {
  const plannedEntry = optionalDecimal(trade.plannedEntry);
  const plannedStop = optionalDecimal(trade.plannedStop);
  const plannedQuantity = optionalDecimal(trade.plannedSize);
  const riskPerShare = computeRiskPerShare(trade);
  const fromPlan = computePlannedRiskFromPlan(trade);
  const stored = optionalDecimal(trade.plannedRisk);
  const multiplier = planMultiplier(trade);

  if (fromPlan != null && (stored == null || stored === fromPlan)) {
    return {
      initialRisk: fromPlan,
      riskPerShare,
      plannedQuantity,
      plannedEntry,
      plannedStop,
      multiplier,
      source: "plan_inputs",
    };
  }

  if (stored != null) {
    return {
      initialRisk: stored,
      riskPerShare,
      plannedQuantity,
      plannedEntry,
      plannedStop,
      multiplier,
      source: "stored_planned_risk",
    };
  }

  return {
    initialRisk: fromPlan,
    riskPerShare,
    plannedQuantity,
    plannedEntry,
    plannedStop,
    multiplier,
    source: fromPlan != null ? "plan_inputs" : "unavailable",
  };
}
