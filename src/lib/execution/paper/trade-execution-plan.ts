/** Broker-neutral exit planning attached to an entry intent (not strategy logic). */
export interface TradeExecutionPlan {
  stopLossPrice: number | null;
  profitTargetPrice: number | null;
}

export function validateExecutionPlanForLong(plan: TradeExecutionPlan, entryPrice: number): string | null {
  if (plan.stopLossPrice != null && plan.stopLossPrice >= entryPrice) {
    return "stop must be below entry for long";
  }
  if (plan.profitTargetPrice != null && plan.profitTargetPrice <= entryPrice) {
    return "target must be above entry for long";
  }
  return null;
}
