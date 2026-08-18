import { buildTradeAuditRecord, calculateTrade, microsToNumber } from "../calc";
import { CALC_VERSION, INPUT_VERSION } from "../calc/decimal";
import type { ExecutionFeeInput, ExecutionInput, TradeInput, TradeLegInput, TradeStatus } from "../calc/types";

export const JOURNAL_SAVE_RPC = "journal_save_trade_v1";
export const JOURNAL_TIMEZONE = "America/New_York";

/** Live journal_trades.setup_tag values used by the existing Stocksist journal UI. */
export const LEGACY_SETUP_TAGS = [
  "flat_top_breakout",
  "bottom_bouncer",
  "flat_base_breakout",
  "breakout_pullback",
  "other",
] as const;

export type LegacySetupTag = (typeof LEGACY_SETUP_TAGS)[number];
export type LegacyTradeStatus = "open" | "closed";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLOSED_LIFECYCLES = new Set<string>([
  "closed",
  "closed_before_expiration",
  "expired",
  "assigned",
  "exercised",
  "rolled",
  "expired_itm",
  "expired_worthless",
  "archived",
  "cancelled",
]);

export interface JournalSaveTradeRow {
  id: string;
  symbol: string;
  side: "long" | "short";
  status: LegacyTradeStatus;
  lifecycle_status: string;
  qty: number;
  entry_price: number;
  exit_price: number | null;
  entry_date: string;
  exit_date: string | null;
  session_date: string;
  timezone: string;
  account_id: string | null;
  asset_class: string;
  instrument: string;
  direction: "long" | "short";
  playbook_id: string | null;
  playbook_name: string | null;
  setup_tag: LegacySetupTag | null;
  planned_risk: number | null;
  planned_entry: number | null;
  planned_stop: number | null;
  planned_target: number | null;
  planned_size: number | null;
  thesis: string | null;
  reviewed_at: string | null;
  calculation_version: string;
  source: "manual";
  stop_price: number | null;
  target_price: number | null;
  return_dollars: number;
  return_pct: number | null;
  hold_duration_minutes: number | null;
}

export interface JournalSaveExecutionRow {
  id: string;
  occurred_at: string;
  occurred_at_utc: string;
  timezone: string;
  action: string;
  quantity: number;
  price: number;
  multiplier: number;
  commission: number;
  regulatory_fee: number;
  other_fee: number;
  fee_currency: string;
  venue: string | null;
  order_type: string | null;
  source: string | null;
  external_execution_id: string | null;
  idempotency_key: string | null;
  import_job_id: string | null;
  note: string | null;
  leg_id: string | null;
  fees: JournalSaveFeeRow[];
}

export interface JournalSaveFeeRow {
  kind: ExecutionFeeInput["kind"];
  amount: number;
  currency: string;
  native_amount: number | null;
  native_currency: string | null;
  conversion_rate: number | null;
  conversion_timestamp: string | null;
  conversion_source: string | null;
  account_currency_amount: number | null;
}

export interface JournalSaveLegRow {
  id: string;
  action: string;
  right: string;
  strike: number;
  expiration: string;
  contracts: number;
  multiplier: number;
  occ_symbol: string | null;
  status: string;
}

export interface JournalSavePayload {
  trade: JournalSaveTradeRow;
  account: { id: string | null; name: string };
  plan: {
    planned_entry: number | null;
    planned_stop: number | null;
    planned_target: number | null;
    planned_size: number | null;
    planned_risk: number | null;
    thesis: string | null;
  };
  legs: JournalSaveLegRow[];
  executions: JournalSaveExecutionRow[];
  lifecycle: { status: string };
  calculation: {
    calculation_version: string;
    input_version: string;
    state: string;
    gross_pnl: number;
    net_pnl: number;
    fees: number;
    remaining_qty: number;
    weighted_avg_entry: number | null;
    weighted_avg_exit: number | null;
    r_multiple: number | null;
    outcome: string;
    planned_risk_source: string;
    result: Record<string, unknown>;
  };
  audit: {
    event_type: string;
    timestamp: string;
    exclusions: string[];
    observations: string[];
    input_summary: Record<string, unknown>;
  };
}

export function isUuid(value: string | null | undefined): boolean {
  return Boolean(value && UUID_RE.test(value));
}

export function newPersistentId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isStableId(value: string | null | undefined): boolean {
  return isUuid(value) && !value!.startsWith("draft");
}

export function sessionDateInTimezone(isoTimestamp: string, timeZone = JOURNAL_TIMEZONE): string {
  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) return isoTimestamp.slice(0, 10);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return isoTimestamp.slice(0, 10);
  return `${year}-${month}-${day}`;
}

export function resolveSessionDate(trade: TradeInput, timeZone = JOURNAL_TIMEZONE): string {
  if (trade.sessionDate && DATE_RE.test(trade.sessionDate)) return trade.sessionDate;
  const first = [...trade.executions].sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc))[0];
  if (first?.timestampUtc) return sessionDateInTimezone(first.timestampUtc, timeZone);
  return sessionDateInTimezone(new Date().toISOString(), timeZone);
}

export function normalizeLegacyStatus(status: string, remainingQuantityZero: boolean): LegacyTradeStatus {
  if (status === "partially_closed" || status === "draft" || status === "planned" || status === "open") {
    return "open";
  }
  if (CLOSED_LIFECYCLES.has(status) || status === "closed") {
    return remainingQuantityZero ? "closed" : "open";
  }
  return remainingQuantityZero ? "closed" : "open";
}

export function normalizeSetupTag(playbookName: string | null | undefined): LegacySetupTag | null {
  if (!playbookName) return null;
  const trimmed = playbookName.trim();
  if (!trimmed) return null;
  return (LEGACY_SETUP_TAGS as readonly string[]).includes(trimmed) ? (trimmed as LegacySetupTag) : null;
}

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (value == null || value === "") return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function microsOrNull(value: bigint | null): number | null {
  return value == null ? null : microsToNumber(value);
}

function persistId(value: string | null | undefined): string {
  return isStableId(value) ? value! : newPersistentId();
}

export function assignPersistentIds(trade: TradeInput): TradeInput {
  const id = persistId(trade.id);
  const legs = trade.legs?.map((leg) => ({ ...leg, id: persistId(leg.id) }));
  const legMap = new Map<string, string>();
  trade.legs?.forEach((leg, index) => {
    const next = legs![index].id;
    legMap.set(leg.id, next);
  });
  const executions = trade.executions.map((execution) => ({
    ...execution,
    id: persistId(execution.id),
    legId: execution.legId ? (legMap.get(execution.legId) ?? (isStableId(execution.legId) ? execution.legId : undefined)) : execution.legId,
  }));
  return { ...trade, id, legs, executions };
}

function feeAmount(value: number | string | undefined): number {
  return toNumber(value, 0);
}

function executionFees(execution: ExecutionInput): JournalSaveFeeRow[] {
  const rows: JournalSaveFeeRow[] = (execution.fees ?? []).map((fee) => ({
    kind: fee.kind,
    amount: toNumber(fee.amount),
    currency: fee.currency || execution.feeCurrency || "USD",
    native_amount: toNumberOrNull(fee.nativeAmount),
    native_currency: fee.nativeCurrency ?? null,
    conversion_rate: toNumberOrNull(fee.conversionRate),
    conversion_timestamp: fee.conversionTimestamp ?? null,
    conversion_source: fee.conversionSource ?? null,
    account_currency_amount: toNumberOrNull(fee.accountCurrencyAmount),
  }));
  const kinds = new Set(rows.map((row) => row.kind));
  const currency = execution.feeCurrency || "USD";
  const extras: Array<[ExecutionFeeInput["kind"], number | string | undefined]> = [
    ["commission", execution.commission],
    ["regulatory", execution.regulatoryFee],
    ["other", execution.otherFee],
  ];
  for (const [kind, amount] of extras) {
    if (kinds.has(kind) || feeAmount(amount) === 0) continue;
    rows.push({
      kind,
      amount: feeAmount(amount),
      currency,
      native_amount: null,
      native_currency: null,
      conversion_rate: null,
      conversion_timestamp: null,
      conversion_source: null,
      account_currency_amount: feeAmount(amount),
    });
  }
  return rows;
}

function toLegRow(leg: TradeLegInput): JournalSaveLegRow {
  return {
    id: persistId(leg.id),
    action: leg.action,
    right: leg.right,
    strike: toNumber(leg.strike),
    expiration: leg.expiration,
    contracts: toNumber(leg.contracts),
    multiplier: toNumber(leg.multiplier, 100),
    occ_symbol: leg.occSymbol ?? null,
    status: leg.status,
  };
}

function toExecutionRow(execution: ExecutionInput, tradeId: string): JournalSaveExecutionRow {
  const id = persistId(execution.id);
  const occurred = execution.timestampUtc || new Date(execution.timestamp).toISOString();
  return {
    id,
    occurred_at: occurred,
    occurred_at_utc: occurred,
    timezone: execution.originalTimezone || JOURNAL_TIMEZONE,
    action: execution.action,
    quantity: toNumber(execution.quantity),
    price: toNumber(execution.price),
    multiplier: toNumber(execution.multiplier, 1),
    commission: feeAmount(execution.commission),
    regulatory_fee: feeAmount(execution.regulatoryFee),
    other_fee: feeAmount(execution.otherFee),
    fee_currency: execution.feeCurrency || "USD",
    venue: execution.venue ?? null,
    order_type: execution.orderType ?? null,
    source: execution.source ?? null,
    external_execution_id: execution.externalExecutionId ?? null,
    idempotency_key: execution.idempotencyKey ?? `save:${tradeId}:${id}`,
    import_job_id: isUuid(execution.importJobId) ? execution.importJobId! : null,
    note: execution.note ?? null,
    leg_id: isUuid(execution.legId) ? execution.legId! : null,
    fees: executionFees(execution),
  };
}

function accountPayload(accountId: string): { id: string | null; name: string } {
  if (isUuid(accountId)) return { id: accountId, name: "Primary Account" };
  return { id: null, name: "Primary Account" };
}

export function buildJournalSavePayload(trade: TradeInput): JournalSavePayload {
  const persisted = assignPersistentIds(trade);
  const calc = calculateTrade(persisted);
  const remainingZero = calc.remainingQuantity === 0n;
  const first = [...persisted.executions].sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc))[0];
  const lastClose = remainingZero
    ? [...persisted.executions].sort((a, b) => a.timestampUtc.localeCompare(b.timestampUtc)).at(-1)
    : undefined;
  const timezone = first?.originalTimezone || JOURNAL_TIMEZONE;
  const sessionDate = resolveSessionDate(persisted, timezone);
  const entryDate = first?.timestampUtc ?? `${sessionDate}T13:30:00.000Z`;
  const lifecycleStatus: TradeStatus = calc.status;
  const audit = buildTradeAuditRecord(persisted, calc);
  const legs = (persisted.legs ?? []).map(toLegRow);
  const executions = persisted.executions.map((execution) => toExecutionRow(execution, persisted.id));

  const plannedEntry = toNumberOrNull(persisted.plannedEntry);
  const plannedStop = toNumberOrNull(persisted.plannedStop);
  const plannedTarget = toNumberOrNull(persisted.plannedTarget);
  const plannedSize = toNumberOrNull(persisted.plannedSize);
  const plannedRisk = toNumberOrNull(persisted.plannedRisk);
  const playbookId = isUuid(persisted.playbookId) ? persisted.playbookId! : null;

  return {
    trade: {
      id: persisted.id,
      symbol: persisted.symbol,
      side: persisted.direction,
      status: normalizeLegacyStatus(lifecycleStatus, remainingZero),
      lifecycle_status: lifecycleStatus,
      qty: plannedSize ?? toNumber(first?.quantity),
      entry_price: microsOrNull(calc.weightedAverageEntry) ?? toNumber(first?.price),
      exit_price: remainingZero ? microsOrNull(calc.weightedAverageExit) : null,
      entry_date: entryDate,
      exit_date: remainingZero ? lastClose?.timestampUtc ?? null : null,
      session_date: sessionDate,
      timezone,
      account_id: accountPayload(persisted.accountId).id,
      asset_class: persisted.assetClass,
      instrument: persisted.instrument,
      direction: persisted.direction,
      playbook_id: playbookId,
      playbook_name: persisted.playbookName ?? null,
      setup_tag: normalizeSetupTag(persisted.playbookName),
      planned_risk: plannedRisk,
      planned_entry: plannedEntry,
      planned_stop: plannedStop,
      planned_target: plannedTarget,
      planned_size: plannedSize,
      thesis: persisted.thesis ?? null,
      reviewed_at: persisted.reviewed ? lastClose?.timestampUtc ?? new Date().toISOString() : null,
      calculation_version: calc.calculationVersion,
      source: "manual",
      stop_price: plannedStop,
      target_price: plannedTarget,
      return_dollars: microsToNumber(calc.netRealizedPnl),
      return_pct: calc.returnOnNotional,
      hold_duration_minutes: calc.holdingDurationMinutes,
    },
    account: accountPayload(persisted.accountId),
    plan: {
      planned_entry: plannedEntry,
      planned_stop: plannedStop,
      planned_target: plannedTarget,
      planned_size: plannedSize,
      planned_risk: plannedRisk,
      thesis: persisted.thesis ?? null,
    },
    legs,
    executions,
    lifecycle: { status: lifecycleStatus },
    calculation: {
      calculation_version: calc.calculationVersion || CALC_VERSION,
      input_version: calc.inputVersion || INPUT_VERSION,
      state: calc.calculationState,
      gross_pnl: microsToNumber(calc.grossRealizedPnl),
      net_pnl: microsToNumber(calc.netRealizedPnl),
      fees: microsToNumber(calc.totalFees),
      remaining_qty: microsToNumber(calc.remainingQuantity),
      weighted_avg_entry: microsOrNull(calc.weightedAverageEntry),
      weighted_avg_exit: microsOrNull(calc.weightedAverageExit),
      r_multiple: calc.rMultiple,
      outcome: calc.outcome,
      planned_risk_source: calc.plannedRiskSource,
      result: {
        gross_pnl: microsToNumber(calc.grossRealizedPnl),
        net_pnl: microsToNumber(calc.netRealizedPnl),
        fees: microsToNumber(calc.totalFees),
        remaining_qty: microsToNumber(calc.remainingQuantity),
        weighted_avg_entry: microsOrNull(calc.weightedAverageEntry),
        weighted_avg_exit: microsOrNull(calc.weightedAverageExit),
        r_multiple: calc.rMultiple,
        outcome: calc.outcome,
        planned_risk_source: calc.plannedRiskSource,
        over_exit_blocked: calc.overExitBlocked,
        exclusions: calc.exclusions,
      },
    },
    audit: {
      event_type: audit.eventType,
      timestamp: audit.timestamp,
      exclusions: audit.exclusions,
      observations: [
        `calculation_version=${audit.calculationVersion}`,
        `input_version=${audit.inputVersion}`,
        `planned_risk_source=${audit.plannedRiskSource}`,
      ],
      input_summary: { ...audit.inputSummary },
    },
  };
}
