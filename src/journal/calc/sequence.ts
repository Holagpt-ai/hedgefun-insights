import type { TradeCalculation, TradeInput } from "./types";
import { calculateTrade } from "./engine";

export interface SequenceMetric {
  tradeId: string;
  tradeNumberOfDay: number;
  priorResult: "win" | "loss" | "breakeven" | "none";
  priorTwo: string;
  consecutiveWins: number;
  consecutiveLosses: number;
  sameSymbolReentry: boolean;
  minutesSincePriorExit: number | null;
}

export function sequenceMetrics(trades: TradeInput[]): SequenceMetric[] {
  const calcs = trades
    .map((trade) => ({ trade, calc: calculateTrade(trade) }))
    .sort((a, b) => {
      const aTime = a.trade.executions[0]?.timestampUtc ?? "";
      const bTime = b.trade.executions[0]?.timestampUtc ?? "";
      return aTime.localeCompare(bTime);
    });

  const byDay = new Map<string, { trade: TradeInput; calc: TradeCalculation }[]>();
  for (const row of calcs) {
    const day = row.trade.sessionDate ?? row.trade.executions[0]?.timestampUtc.slice(0, 10) ?? "unknown";
    const list = byDay.get(day) ?? [];
    list.push(row);
    byDay.set(day, list);
  }

  const results: SequenceMetric[] = [];
  for (const dayRows of byDay.values()) {
    let consecutiveWins = 0;
    let consecutiveLosses = 0;
    let prior: TradeCalculation | null = null;
    let prior2: TradeCalculation | null = null;
    dayRows.forEach((row, index) => {
      const sameSymbolReentry = Boolean(
        prior && prior.symbol === row.calc.symbol && prior.remainingQuantity === 0n,
      );
      let minutesSincePriorExit: number | null = null;
      if (prior) {
        const priorExit = row.trade.executions[0]?.timestampUtc;
        const prevLast = dayRows[index - 1]?.trade.executions.at(-1)?.timestampUtc;
        if (priorExit && prevLast) {
          minutesSincePriorExit = Math.round((Date.parse(priorExit) - Date.parse(prevLast)) / 60000);
        }
      }
      results.push({
        tradeId: row.trade.id,
        tradeNumberOfDay: index + 1,
        priorResult: prior?.outcome === "win" || prior?.outcome === "loss" || prior?.outcome === "breakeven" ? prior.outcome : "none",
        priorTwo: [prior2?.outcome ?? "none", prior?.outcome ?? "none"].join("-"),
        consecutiveWins,
        consecutiveLosses,
        sameSymbolReentry,
        minutesSincePriorExit,
      });
      if (row.calc.outcome === "win") {
        consecutiveWins += 1;
        consecutiveLosses = 0;
      } else if (row.calc.outcome === "loss") {
        consecutiveLosses += 1;
        consecutiveWins = 0;
      }
      prior2 = prior;
      prior = row.calc;
    });
  }
  return results;
}
