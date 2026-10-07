import type { ExecutionOrchestratorResult } from "@/lib/execution/orchestrator/execution-orchestrator";
import type { StocksistSignal } from "@/lib/execution/signal/stocksist-signal";
import type { TradeExecutionPlan } from "@/lib/execution/paper/trade-execution-plan";
import type { PaperExitReason } from "@/lib/execution/paper/paper-account-types";

export type ShadowOpportunityStatus =
  | "OBSERVING"
  | "APPROVED"
  | "REJECTED"
  | "PAPER_ENTERED"
  | "STOPPED"
  | "TARGET_HIT"
  | "CLOSED";

export interface ShadowOpportunityRecord {
  signal: StocksistSignal;
  plan: TradeExecutionPlan;
  orchestratorResult: ExecutionOrchestratorResult;
  status: ShadowOpportunityStatus;
  rejectionReasons: string[];
  paperOrderId: string | null;
  entryPrice: number | null;
  exitPrice: number | null;
  exitReason: PaperExitReason | null;
  realizedPnl: number | null;
  recordedAt: string;
}
