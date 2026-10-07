import type { TradingEvent } from "@/lib/execution/events/trading-event";
import type { PaperAccountSnapshot } from "@/lib/execution/paper/paper-account-types";
import { computePaperStatistics, type PaperTradingStatistics } from "@/lib/execution/paper/paper-statistics";
import type { ShadowOpportunityRecord } from "@/lib/execution/shadow/shadow-opportunity";
import type { StocksistSignal } from "@/lib/execution/signal/stocksist-signal";
import { labelRiskReason } from "@/lib/execution/observation/risk-reason-labels";

export interface SessionSummary {
  opportunities: number;
  approved: number;
  rejected: number;
  paperTrades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface RejectionBreakdownRow {
  code: string;
  label: string;
  count: number;
}

export interface SetupBreakdownRow {
  setupKey: string;
  opportunities: number;
  approved: number;
  paperTrades: number;
  wins: number;
  losses: number;
  realizedPnl: number;
}

export interface MissedOpportunityRow {
  symbol: string;
  recordedAt: string;
  setupKey: string;
  rejectionReasons: string[];
  rejectionLabels: string[];
  status: ShadowOpportunityRecord["status"];
}

export interface SymbolTimelineEntry {
  timestamp: string;
  symbol: string;
  kind: "event" | "signal" | "paper";
  label: string;
  detail: string | null;
}

export function isRiskApproved(record: ShadowOpportunityRecord): boolean {
  return record.rejectionReasons.includes("APPROVED");
}

export function isRejectedOpportunity(record: ShadowOpportunityRecord): boolean {
  if (record.status === "APPROVED") return false;
  if (record.status === "REJECTED") return true;
  if (record.rejectionReasons.length === 0) return false;
  return !isRiskApproved(record);
}

export function setupKeyForSignal(signal: StocksistSignal): string {
  const meta = signal.metadata ?? {};
  const scanner = typeof meta.scannerEvent === "string" ? meta.scannerEvent.trim() : "";
  if (scanner) return scanner;
  if (signal.eventType?.trim()) return signal.eventType.trim();
  return signal.strategyId;
}

export function computeSessionSummary(
  shadows: readonly ShadowOpportunityRecord[],
  account: PaperAccountSnapshot,
): SessionSummary {
  const stats: PaperTradingStatistics = computePaperStatistics(account);
  const opportunities = shadows.length;
  const approved = shadows.filter(isRiskApproved).length;
  const rejected = shadows.filter(isRejectedOpportunity).length;
  const paperTrades = shadows.filter((r) =>
    r.status === "PAPER_ENTERED" || r.status === "STOPPED" || r.status === "TARGET_HIT"
  ).length;

  return {
    opportunities,
    approved,
    rejected,
    paperTrades,
    wins: stats.wins,
    losses: stats.losses,
    winRate: stats.winRate,
    realizedPnl: stats.realizedPnl,
    unrealizedPnl: stats.unrealizedPnl,
  };
}

export function computeRejectionBreakdown(
  shadows: readonly ShadowOpportunityRecord[],
): RejectionBreakdownRow[] {
  const counts = new Map<string, number>();
  for (const row of shadows) {
    for (const code of row.rejectionReasons) {
      if (code === "APPROVED") continue;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([code, count]) => ({ code, label: labelRiskReason(code), count }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

export function computeSetupBreakdown(
  shadows: readonly ShadowOpportunityRecord[],
): SetupBreakdownRow[] {
  const map = new Map<string, SetupBreakdownRow>();
  for (const row of shadows) {
    const key = setupKeyForSignal(row.signal);
    const bucket = map.get(key) ?? {
      setupKey: key,
      opportunities: 0,
      approved: 0,
      paperTrades: 0,
      wins: 0,
      losses: 0,
      realizedPnl: 0,
    };
    bucket.opportunities += 1;
    if (isRiskApproved(row)) bucket.approved += 1;
    if (row.status === "PAPER_ENTERED" || row.status === "STOPPED" || row.status === "TARGET_HIT") {
      bucket.paperTrades += 1;
    }
    if (row.realizedPnl != null && Number.isFinite(row.realizedPnl)) {
      bucket.realizedPnl += row.realizedPnl;
      if (row.realizedPnl > 0) bucket.wins += 1;
      else if (row.realizedPnl < 0) bucket.losses += 1;
    }
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => b.opportunities - a.opportunities || a.setupKey.localeCompare(b.setupKey));
}

export function listMissedOpportunities(
  shadows: readonly ShadowOpportunityRecord[],
): MissedOpportunityRow[] {
  return shadows
    .filter(isRejectedOpportunity)
    .map((row) => {
      const reasons = row.rejectionReasons.filter((c) => c !== "APPROVED");
      return {
        symbol: row.signal.symbol,
        recordedAt: row.recordedAt,
        setupKey: setupKeyForSignal(row.signal),
        rejectionReasons: reasons,
        rejectionLabels: reasons.map(labelRiskReason),
        status: row.status,
      };
    })
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

function eventTimelineLabel(event: TradingEvent): string {
  switch (event.eventType) {
    case "INTENT_RECEIVED":
      return "Trade intent proposed";
    case "RISK_APPROVED":
      return "Risk approved";
    case "RISK_REJECTED":
      return "Risk rejected";
    case "ORDER_SUBMITTED":
      return "Paper order submitted";
    case "ORDER_FILLED":
      return "Paper entry";
    case "POSITION_OPENED":
      return "Position opened";
    case "POSITION_CLOSED":
      return "Position closed";
    case "SIGNAL_DISCOVERED":
      return "Signal discovered";
    default:
      return event.eventType.replace(/_/g, " ").toLowerCase();
  }
}

export function buildSymbolTimeline(
  symbol: string,
  events: readonly TradingEvent[],
  shadows: readonly ShadowOpportunityRecord[],
): SymbolTimelineEntry[] {
  const sym = symbol.trim().toUpperCase();
  const entries: SymbolTimelineEntry[] = [];

  for (const event of events) {
    if ((event.symbol ?? "").toUpperCase() !== sym) continue;
    const reason = event.reasonCodes.filter((c) => c !== "APPROVED").join(", ");
    entries.push({
      timestamp: event.timestamp,
      symbol: sym,
      kind: "event",
      label: eventTimelineLabel(event),
      detail: reason.length > 0 ? reason : null,
    });
  }

  for (const row of shadows) {
    if (row.signal.symbol.toUpperCase() !== sym) continue;
    entries.push({
      timestamp: row.signal.signalAt,
      symbol: sym,
      kind: "signal",
      label: setupKeyForSignal(row.signal),
      detail: row.signal.thesisSummary,
    });
    if (row.status === "PAPER_ENTERED" && row.entryPrice != null) {
      entries.push({
        timestamp: row.recordedAt,
        symbol: sym,
        kind: "paper",
        label: "Paper entry",
        detail: `@ ${row.entryPrice.toFixed(2)}`,
      });
    }
    if (row.exitReason && row.exitPrice != null) {
      entries.push({
        timestamp: row.recordedAt,
        symbol: sym,
        kind: "paper",
        label: row.exitReason === "PROFIT_TARGET" ? "Target hit" : row.exitReason === "STOP_LOSS" ? "Stop hit" : "Exit",
        detail: `@ ${row.exitPrice.toFixed(2)} · P&L ${row.realizedPnl?.toFixed(2) ?? "—"}`,
      });
    }
  }

  return entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function symbolsForTimeline(
  events: readonly TradingEvent[],
  shadows: readonly ShadowOpportunityRecord[],
): string[] {
  const set = new Set<string>();
  for (const e of events) {
    if (e.symbol) set.add(e.symbol.toUpperCase());
  }
  for (const s of shadows) {
    set.add(s.signal.symbol.toUpperCase());
  }
  return [...set].sort();
}
