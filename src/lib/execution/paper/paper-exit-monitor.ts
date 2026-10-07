import type { PaperPosition } from "@/lib/execution/paper/paper-account-types";
import type { PaperExitReason } from "@/lib/execution/paper/paper-account-types";

export interface PaperExitTrigger {
  symbol: string;
  quantity: number;
  currentPrice: number;
  exitReason: PaperExitReason;
}

/** Deterministic stop/target checks for long paper positions. */
export function detectLongExitTriggers(
  positions: readonly PaperPosition[],
  prices: Readonly<Record<string, number>>,
): PaperExitTrigger[] {
  const out: PaperExitTrigger[] = [];
  for (const pos of positions) {
    if (pos.side !== "long") continue;
    const px = prices[pos.symbol] ?? pos.currentPrice;
    if (pos.stopLossPrice != null && px <= pos.stopLossPrice) {
      out.push({
        symbol: pos.symbol,
        quantity: pos.quantity,
        currentPrice: px,
        exitReason: "STOP_LOSS",
      });
      continue;
    }
    if (pos.profitTargetPrice != null && px >= pos.profitTargetPrice) {
      out.push({
        symbol: pos.symbol,
        quantity: pos.quantity,
        currentPrice: px,
        exitReason: "PROFIT_TARGET",
      });
    }
  }
  return out;
}
