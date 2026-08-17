import type { Micros } from "./decimal";

export const JOURNAL_SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,14}$/;

export type AssetClass = "stock" | "equity_option" | "crypto_spot";
export type Direction = "long" | "short";
export type ExecutionAction = "buy" | "sell" | "short" | "cover";
export type TradeStatus =
  | "draft"
  | "planned"
  | "open"
  | "partially_closed"
  | "closed"
  | "cancelled"
  | "archived"
  | "expired"
  | "assigned"
  | "exercised"
  | "rolled"
  | "closed_before_expiration"
  | "expired_itm"
  | "expired_worthless";

export type Outcome = "win" | "loss" | "breakeven" | "open" | "excluded";
export type CalculationState = "authoritative" | "estimated" | "unavailable" | "incomplete";
export type BreakevenMode = "r" | "currency" | "strict_zero";

export interface ExecutionFeeInput {
  kind:
    | "commission"
    | "regulatory"
    | "locate"
    | "borrow"
    | "hard_to_borrow"
    | "exchange"
    | "network"
    | "other";
  amount: number | string;
  currency: string;
  nativeAmount?: number | string;
  nativeCurrency?: string;
  conversionRate?: number | string;
  conversionTimestamp?: string;
  conversionSource?: string;
  accountCurrencyAmount?: number | string;
}

export interface ExecutionInput {
  id: string;
  timestamp: string;
  timestampUtc: string;
  originalTimezone: string;
  action: ExecutionAction;
  legId?: string;
  quantity: number | string;
  price: number | string;
  fees?: ExecutionFeeInput[];
  commission?: number | string;
  regulatoryFee?: number | string;
  otherFee?: number | string;
  feeCurrency?: string;
  multiplier?: number | string;
  orderType?: string;
  venue?: string;
  source?: string;
  externalExecutionId?: string;
  idempotencyKey?: string;
  importJobId?: string;
  note?: string;
}

export interface TradeLegInput {
  id: string;
  action: "buy" | "sell";
  right: "call" | "put";
  strike: number | string;
  expiration: string;
  contracts: number | string;
  multiplier: number | string;
  occSymbol?: string;
  status: TradeStatus;
}

export interface TradeInput {
  id: string;
  accountId: string;
  assetClass: AssetClass;
  instrument: string;
  symbol: string;
  direction: Direction;
  status: TradeStatus;
  executions: ExecutionInput[];
  legs?: TradeLegInput[];
  plannedRisk?: number | string | null;
  plannedEntry?: number | string | null;
  plannedStop?: number | string | null;
  plannedTarget?: number | string | null;
  plannedSize?: number | string | null;
  playbookId?: string | null;
  playbookName?: string | null;
  tags?: string[];
  sessionDate?: string;
  thesis?: string | null;
  reviewed?: boolean;
  planned?: boolean;
  ruleDeviation?: boolean;
  feesIncomplete?: boolean;
  excludedFromAnalytics?: boolean;
  exclusionReason?: string;
}

export interface PositionResult {
  openQuantity: Micros;
  closedQuantity: Micros;
  remainingQuantity: Micros;
  weightedAverageEntry: Micros | null;
  weightedAverageExit: Micros | null;
  entryNotional: Micros;
  exitNotional: Micros;
  grossRealizedPnl: Micros;
  totalFees: Micros;
  feeDrag: Micros;
  netRealizedPnl: Micros;
  holdingDurationMinutes: number | null;
  initialRisk: Micros | null;
  rMultiple: number | null;
  returnOnNotional: number | null;
  returnOnDefinedRisk: number | null;
  outcome: Outcome;
  calculationState: CalculationState;
  exclusions: string[];
  overExitBlocked: boolean;
}

export interface TradeCalculation extends PositionResult {
  tradeId: string;
  symbol: string;
  assetClass: AssetClass;
  direction: Direction;
  status: TradeStatus;
  sessionDate: string | null;
  playbookName: string | null;
  calculationVersion: string;
  inputVersion: string;
}

export interface AggregateMetrics {
  tradeCount: number;
  includedCount: number;
  excludedCount: number;
  exclusionReasons: Record<string, number>;
  wins: number;
  losses: number;
  breakevens: number;
  winRate: number | null;
  grossPnl: Micros;
  fees: Micros;
  netPnl: Micros;
  profitFactor: number | null;
  expectancyDollars: Micros | null;
  expectancyR: number | null;
  averageR: number | null;
  averageWin: Micros | null;
  averageLoss: Micros | null;
  largestWin: { tradeId: string; symbol: string; net: Micros } | null;
  largestLoss: { tradeId: string; symbol: string; net: Micros } | null;
  sampleSize: number;
  calculationState: CalculationState;
  calculationVersion: string;
}

export interface DailyMetric {
  date: string;
  netPnl: Micros;
  grossPnl: Micros;
  fees: Micros;
  tradeCount: number;
  wins: number;
  losses: number;
  breakevens: number;
  averageR: number | null;
  reviewComplete?: boolean;
}

export interface ReconciliationResult {
  derivedEquity: Micros;
  reportedBalance: Micros | null;
  difference: Micros | null;
  state:
    | "reconciled"
    | "within_tolerance"
    | "mismatch"
    | "missing_balance"
    | "stale_balance"
    | "missing_conversion"
    | "pending_review";
}

export interface ProcessScoreComponent {
  key: string;
  weight: number;
  score: number | null;
  applicable: boolean;
  reason?: string;
}

export interface ProcessScoreResult {
  total: number | null;
  state: "unavailable" | "provisional" | "final";
  confidence: "low" | "medium" | "high";
  components: ProcessScoreComponent[];
  version: string;
}

export interface CalculationLineage {
  calculationVersion: string;
  inputVersion: string;
  timestamp: string;
  exclusions: string[];
  observations: string[];
}
