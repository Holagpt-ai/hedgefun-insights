import type { PaperAccountSnapshot } from "@/lib/execution/paper/paper-account-types";

export interface PaperTradingStatistics {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  realizedPnl: number;
  unrealizedPnl: number;
  averageWinner: number | null;
  averageLoser: number | null;
  largestWinner: number;
  largestLoser: number;
  openPositionCount: number;
  grossExposure: number;
  accountEquity: number;
}

export function computePaperStatistics(account: PaperAccountSnapshot): PaperTradingStatistics {
  const closed = account.closedTrades;
  const winners = closed.filter((t) => t.realizedPnl > 0);
  const losers = closed.filter((t) => t.realizedPnl < 0);
  const grossExposure = account.openPositions.reduce((s, p) => s + p.marketValue, 0);

  return {
    totalTrades: closed.length,
    wins: winners.length,
    losses: losers.length,
    winRate: closed.length ? winners.length / closed.length : null,
    realizedPnl: account.realizedPnl,
    unrealizedPnl: account.unrealizedPnl,
    averageWinner: winners.length
      ? winners.reduce((s, t) => s + t.realizedPnl, 0) / winners.length
      : null,
    averageLoser: losers.length
      ? losers.reduce((s, t) => s + t.realizedPnl, 0) / losers.length
      : null,
    largestWinner: winners.length ? Math.max(...winners.map((t) => t.realizedPnl)) : 0,
    largestLoser: losers.length ? Math.min(...losers.map((t) => t.realizedPnl)) : 0,
    openPositionCount: account.openPositions.length,
    grossExposure,
    accountEquity: account.equity,
  };
}
