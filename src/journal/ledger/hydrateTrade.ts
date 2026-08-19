import type {
  AssetClass,
  Direction,
  ExecutionAction,
  ExecutionFeeInput,
  ExecutionInput,
  TradeInput,
  TradeLegInput,
  TradeStatus,
} from "../calc/types";
import { mapLegacyTrade, type LegacyJournalTradeRow } from "../lib/storage";
import { JOURNAL_TIMEZONE } from "./persist-contract";

export type HydrationSource = "canonical" | "legacy_fallback" | "canonical_incomplete";

export interface CanonicalTradeRow {
  id: string;
  user_id?: string;
  symbol: string;
  side?: string | null;
  qty?: number | string | null;
  entry_price?: number | string | null;
  exit_price?: number | string | null;
  entry_date: string;
  exit_date?: string | null;
  status?: string | null;
  stop_price?: number | string | null;
  target_price?: number | string | null;
  setup_tag?: string | null;
  lifecycle_status?: string | null;
  account_id?: string | null;
  asset_class?: string | null;
  instrument?: string | null;
  direction?: string | null;
  playbook_id?: string | null;
  thesis?: string | null;
  planned_entry?: number | string | null;
  planned_stop?: number | string | null;
  planned_target?: number | string | null;
  planned_size?: number | string | null;
  planned_risk?: number | string | null;
  session_date?: string | null;
  timezone?: string | null;
  reviewed_at?: string | null;
  calculation_version?: string | null;
  source?: string | null;
  import_job_id?: string | null;
}

export interface CanonicalPlanRow {
  trade_id: string;
  planned_entry?: number | string | null;
  planned_stop?: number | string | null;
  planned_target?: number | string | null;
  planned_size?: number | string | null;
  planned_risk?: number | string | null;
  thesis?: string | null;
}

export interface CanonicalAccountRow {
  id: string;
  name: string;
  account_type?: string | null;
  base_currency?: string | null;
  is_primary?: boolean | null;
  user_id?: string | null;
}

export interface CanonicalPlaybookRow {
  id: string;
  name: string;
  user_id?: string | null;
}

export interface CanonicalLegRow {
  id: string;
  trade_id: string;
  action: string;
  right?: string | null;
  strike?: number | string | null;
  expiration?: string | null;
  contracts?: number | string | null;
  multiplier?: number | string | null;
  occ_symbol?: string | null;
  status?: string | null;
  sequence_index?: number | string | null;
}

export interface CanonicalFeeRow {
  id?: string;
  execution_id: string;
  kind: string;
  amount: number | string;
  currency?: string | null;
  native_amount?: number | string | null;
  native_currency?: string | null;
  conversion_rate?: number | string | null;
  conversion_timestamp?: string | null;
  conversion_source?: string | null;
  account_currency_amount?: number | string | null;
}

export interface CanonicalExecutionRow {
  id: string;
  trade_id: string;
  occurred_at?: string | null;
  occurred_at_utc?: string | null;
  timezone?: string | null;
  action: string;
  quantity: number | string;
  price: number | string;
  multiplier?: number | string | null;
  commission?: number | string | null;
  regulatory_fee?: number | string | null;
  other_fee?: number | string | null;
  fee_currency?: string | null;
  venue?: string | null;
  order_type?: string | null;
  source?: string | null;
  external_execution_id?: string | null;
  idempotency_key?: string | null;
  import_job_id?: string | null;
  note?: string | null;
  leg_id?: string | null;
  sequence_index?: number | string | null;
}

export interface CanonicalCalculationRow {
  id?: string;
  trade_id: string;
  calculation_version?: string | null;
  input_version?: string | null;
  state?: string | null;
}

export interface CanonicalTradeGraph {
  trade: CanonicalTradeRow;
  plan?: CanonicalPlanRow | null;
  account?: CanonicalAccountRow | null;
  playbook?: CanonicalPlaybookRow | null;
  legs: CanonicalLegRow[];
  executions: CanonicalExecutionRow[];
  fees: CanonicalFeeRow[];
  calculation?: CanonicalCalculationRow | null;
}

export interface HydratedTrade {
  trade: TradeInput;
  source: HydrationSource;
}

const ACTIONS = new Set<ExecutionAction>(["buy", "sell", "short", "cover"]);
const DIRECTIONS = new Set<Direction>(["long", "short"]);
const ASSETS = new Set<AssetClass>(["stock", "equity_option", "crypto_spot"]);
const STATUSES = new Set<string>([
  "draft",
  "planned",
  "open",
  "partially_closed",
  "closed",
  "cancelled",
  "archived",
  "expired",
  "assigned",
  "exercised",
  "rolled",
  "closed_before_expiration",
  "expired_itm",
  "expired_worthless",
]);

function asNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asAction(value: string | null | undefined, fallback: ExecutionAction): ExecutionAction {
  const raw = (value ?? "").toLowerCase();
  return ACTIONS.has(raw as ExecutionAction) ? (raw as ExecutionAction) : fallback;
}

function asDirection(trade: CanonicalTradeRow): Direction {
  const raw = (trade.direction || trade.side || "long").toLowerCase();
  if (raw === "sell") return "short";
  return DIRECTIONS.has(raw as Direction) ? (raw as Direction) : "long";
}

function asAssetClass(value: string | null | undefined, instrument?: string | null): AssetClass {
  if (value && ASSETS.has(value as AssetClass)) return value as AssetClass;
  if (instrument === "option") return "equity_option";
  if (instrument === "spot") return "crypto_spot";
  return "stock";
}

function asStatus(value: string | null | undefined, fallback: TradeStatus): TradeStatus {
  if (value && STATUSES.has(value)) return value as TradeStatus;
  return fallback;
}

function asFeeKind(kind: string): ExecutionFeeInput["kind"] {
  const known: ExecutionFeeInput["kind"][] = [
    "commission",
    "regulatory",
    "locate",
    "borrow",
    "hard_to_borrow",
    "exchange",
    "network",
    "other",
  ];
  return known.includes(kind as ExecutionFeeInput["kind"]) ? (kind as ExecutionFeeInput["kind"]) : "other";
}

function isoTimestamp(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

export function looksCanonical(graph: CanonicalTradeGraph): boolean {
  if (graph.executions.length > 0 || graph.legs.length > 0 || graph.plan != null || graph.calculation != null) {
    return true;
  }
  const row = graph.trade;
  return Boolean(
    row.lifecycle_status
      || row.asset_class
      || row.account_id
      || row.playbook_id
      || row.planned_entry != null
      || row.planned_stop != null
      || row.planned_size != null,
  );
}

function hydrateFees(execution: CanonicalExecutionRow, feeRows: CanonicalFeeRow[]): ExecutionFeeInput[] {
  const related = feeRows.filter((fee) => fee.execution_id === execution.id);
  if (related.length > 0) {
    return related.map((fee) => ({
      kind: asFeeKind(fee.kind),
      amount: asNumber(fee.amount) ?? 0,
      currency: fee.currency || execution.fee_currency || "USD",
      nativeAmount: asNumber(fee.native_amount) ?? undefined,
      nativeCurrency: fee.native_currency ?? undefined,
      conversionRate: asNumber(fee.conversion_rate) ?? undefined,
      conversionTimestamp: fee.conversion_timestamp ?? undefined,
      conversionSource: fee.conversion_source ?? undefined,
      accountCurrencyAmount: asNumber(fee.account_currency_amount) ?? undefined,
    }));
  }
  const fees: ExecutionFeeInput[] = [];
  const currency = execution.fee_currency || "USD";
  const extras: Array<[ExecutionFeeInput["kind"], number | string | null | undefined]> = [
    ["commission", execution.commission],
    ["regulatory", execution.regulatory_fee],
    ["other", execution.other_fee],
  ];
  for (const [kind, amount] of extras) {
    const n = asNumber(amount);
    if (n == null || n === 0) continue;
    fees.push({ kind, amount: n, currency, accountCurrencyAmount: n });
  }
  return fees;
}

function hydrateExecution(row: CanonicalExecutionRow, feeRows: CanonicalFeeRow[], fallbackTimestamp: string): ExecutionInput {
  const occurred = row.occurred_at_utc || row.occurred_at || fallbackTimestamp;
  const timestampUtc = isoTimestamp(row.occurred_at_utc || row.occurred_at, occurred);
  const fees = hydrateFees(row, feeRows);
  const amountFor = (kind: ExecutionFeeInput["kind"]) =>
    fees.filter((fee) => fee.kind === kind).reduce((sum, fee) => sum + Number(fee.amount), 0);
  const commission = asNumber(row.commission) || amountFor("commission");
  const regulatoryFee = asNumber(row.regulatory_fee) || amountFor("regulatory");
  const otherFee = asNumber(row.other_fee) || amountFor("other");
  const represented = new Set<string>();
  if (commission) represented.add("commission");
  if (regulatoryFee) represented.add("regulatory");
  if (otherFee) represented.add("other");
  const extraFees = fees.filter((fee) => !represented.has(fee.kind));
  return {
    id: row.id,
    timestamp: row.occurred_at || timestampUtc,
    timestampUtc,
    originalTimezone: row.timezone || JOURNAL_TIMEZONE,
    action: asAction(row.action, "buy"),
    quantity: asNumber(row.quantity) ?? 0,
    price: asNumber(row.price) ?? 0,
    multiplier: asNumber(row.multiplier) ?? 1,
    commission,
    regulatoryFee,
    otherFee,
    feeCurrency: row.fee_currency || "USD",
    venue: row.venue ?? undefined,
    orderType: row.order_type ?? undefined,
    source: row.source ?? undefined,
    externalExecutionId: row.external_execution_id ?? undefined,
    idempotencyKey: row.idempotency_key ?? undefined,
    importJobId: row.import_job_id ?? undefined,
    note: row.note ?? undefined,
    legId: row.leg_id ?? undefined,
    fees: extraFees.length > 0 ? extraFees : undefined,
  };
}

function hydrateLeg(row: CanonicalLegRow): TradeLegInput {
  return {
    id: row.id,
    action: row.action === "sell" ? "sell" : "buy",
    right: row.right === "put" ? "put" : "call",
    strike: asNumber(row.strike) ?? 0,
    expiration: row.expiration || "",
    contracts: asNumber(row.contracts) ?? 0,
    multiplier: asNumber(row.multiplier) ?? 100,
    occSymbol: row.occ_symbol ?? undefined,
    status: asStatus(row.status, "open"),
  };
}

function hydrateCanonical(graph: CanonicalTradeGraph): TradeInput {
  const row = graph.trade;
  const plan = graph.plan;
  const direction = asDirection(row);
  const executions = [...graph.executions]
    .sort((a, b) => {
      const left = a.occurred_at_utc || a.occurred_at || "";
      const right = b.occurred_at_utc || b.occurred_at || "";
      const time = left.localeCompare(right);
      if (time !== 0) return time;
      return (asNumber(a.sequence_index) ?? 0) - (asNumber(b.sequence_index) ?? 0);
    })
    .map((execution) => hydrateExecution(execution, graph.fees, row.entry_date));
  const legs = [...graph.legs]
    .sort((a, b) => (asNumber(a.sequence_index) ?? 0) - (asNumber(b.sequence_index) ?? 0))
    .map(hydrateLeg);
  const assetClass = asAssetClass(row.asset_class, row.instrument);
  const incomplete = executions.length === 0;
  return {
    id: row.id,
    accountId: graph.account?.id || row.account_id || "live-default",
    assetClass,
    instrument: row.instrument || (assetClass === "equity_option" ? "option" : assetClass === "crypto_spot" ? "spot" : "share"),
    symbol: row.symbol,
    direction,
    status: asStatus(row.lifecycle_status, asStatus(row.status, executions.length ? "open" : "planned")),
    executions,
    legs: legs.length > 0 ? legs : undefined,
    plannedEntry: asNumber(plan?.planned_entry ?? row.planned_entry),
    plannedStop: asNumber(plan?.planned_stop ?? row.planned_stop ?? row.stop_price),
    plannedTarget: asNumber(plan?.planned_target ?? row.planned_target ?? row.target_price),
    plannedSize: asNumber(plan?.planned_size ?? row.planned_size),
    plannedRisk: asNumber(plan?.planned_risk ?? row.planned_risk),
    playbookId: graph.playbook?.id || row.playbook_id || null,
    playbookName: graph.playbook?.name ?? null,
    sessionDate: row.session_date || row.entry_date.slice(0, 10),
    thesis: plan?.thesis ?? row.thesis ?? null,
    reviewed: Boolean(row.reviewed_at || row.exit_date),
    planned: Boolean(plan || row.planned_entry != null),
    feesIncomplete: incomplete,
    excludedFromAnalytics: incomplete,
    exclusionReason: incomplete ? "missing_executions" : undefined,
    source: row.source === "import" ? "import" : row.source ?? "manual",
    importJobId: row.import_job_id ?? undefined,
  };
}

export function hydrateTradeGraph(graph: CanonicalTradeGraph): HydratedTrade {
  if (looksCanonical(graph)) {
    if (graph.executions.length === 0) {
      return { trade: hydrateCanonical(graph), source: "canonical_incomplete" };
    }
    return { trade: hydrateCanonical(graph), source: "canonical" };
  }
  return {
    trade: mapLegacyTrade(graph.trade as LegacyJournalTradeRow),
    source: "legacy_fallback",
  };
}

export function assembleTradeGraphs(input: {
  trades: CanonicalTradeRow[];
  plans?: CanonicalPlanRow[];
  accounts?: CanonicalAccountRow[];
  playbooks?: CanonicalPlaybookRow[];
  legs?: CanonicalLegRow[];
  executions?: CanonicalExecutionRow[];
  fees?: CanonicalFeeRow[];
  calculations?: CanonicalCalculationRow[];
}): CanonicalTradeGraph[] {
  const plans = new Map((input.plans ?? []).map((row) => [row.trade_id, row]));
  const accounts = new Map((input.accounts ?? []).map((row) => [row.id, row]));
  const playbooks = new Map((input.playbooks ?? []).map((row) => [row.id, row]));
  const calculations = new Map((input.calculations ?? []).map((row) => [row.trade_id, row]));
  const legs = groupBy(input.legs ?? [], (row) => row.trade_id);
  const executions = groupBy(input.executions ?? [], (row) => row.trade_id);
  const feesByExecution = new Set((input.fees ?? []).map((row) => row.execution_id));
  return input.trades.map((trade) => {
    const tradeExecutions = executions.get(trade.id) ?? [];
    return {
      trade,
      plan: plans.get(trade.id) ?? null,
      account: trade.account_id ? accounts.get(trade.account_id) ?? null : null,
      playbook: trade.playbook_id ? playbooks.get(trade.playbook_id) ?? null : null,
      legs: legs.get(trade.id) ?? [],
      executions: tradeExecutions,
      fees: (input.fees ?? []).filter((fee) => feesByExecution.has(fee.execution_id) && tradeExecutions.some((execution) => execution.id === fee.execution_id)),
      calculation: calculations.get(trade.id) ?? null,
    };
  });
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const list = map.get(id);
    if (list) list.push(row);
    else map.set(id, [row]);
  }
  return map;
}
