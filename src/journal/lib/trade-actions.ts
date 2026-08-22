import type { TradeStatus } from "../calc/types";

const CLOSEABLE: TradeStatus[] = ["open", "partially_closed"];

export function canCloseTrade(status: TradeStatus): boolean {
  return CLOSEABLE.includes(status);
}
