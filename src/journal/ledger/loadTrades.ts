import { isDemoTradeId, mapLegacyTrade, type LegacyJournalTradeRow } from "../lib/storage";
import type { TradeInput } from "../calc/types";
import {
  assembleTradeGraphs,
  hydrateTradeGraph,
  type CanonicalAccountRow,
  type CanonicalCalculationRow,
  type CanonicalExecutionRow,
  type CanonicalFeeRow,
  type CanonicalLegRow,
  type CanonicalPlanRow,
  type CanonicalPlaybookRow,
  type CanonicalTradeRow,
  type HydrationSource,
} from "./hydrateTrade";
import type { JournalSavePayload } from "./persist-contract";

export interface JournalReadQuery {
  select: (cols?: string) => JournalReadQuery;
  eq: (col: string, value: string) => JournalReadQuery;
  in: (col: string, values: string[]) => JournalReadQuery;
  order: (col: string, opts?: { ascending?: boolean }) => JournalReadQuery;
  then: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>["then"];
}

export interface JournalReadDb {
  from: (table: string) => JournalReadQuery;
}

export interface LoadJournalOptions {
  mode: "demo" | "live" | "empty";
  userId: string;
  client: JournalReadDb;
}

export interface LoadedJournalAccount {
  id: string;
  name: string;
  type: string;
  baseCurrency: string;
  beginningBalance: number;
  reportedBalance: number;
  reportedAsOf: string;
}

export interface LoadJournalResult {
  ok: boolean;
  skipped?: "demo";
  error?: string;
  path?: "canonical" | "legacy_fallback";
  trades: TradeInput[];
  accounts: LoadedJournalAccount[];
  hydration?: HydrationSource[];
}

const USER_SCOPED_TABLES = ["journal_accounts", "journal_playbooks"] as const;
const TRADE_CHILD_TABLES = [
  "journal_trade_plans",
  "journal_trade_legs",
  "journal_executions",
  "journal_calculation_runs",
] as const;

export function isMissingRelation(message?: string, code?: string): boolean {
  const lower = (message ?? "").toLowerCase();
  if (code === "42P01" || code === "PGRST205") return true;
  return lower.includes("does not exist") || lower.includes("schema cache") || lower.includes("could not find the table");
}

function isUnexpectedDbError(message?: string, code?: string): boolean {
  if (isMissingRelation(message, code)) return false;
  return Boolean(message || code);
}

async function readTable(
  client: JournalReadDb,
  table: string,
  build: (query: JournalReadQuery) => JournalReadQuery,
): Promise<{ data: unknown[] | null; error: { message: string; code?: string } | null }> {
  const result = await build(client.from(table).select("*"));
  if (result.error) return { data: null, error: result.error };
  return { data: Array.isArray(result.data) ? result.data : [], error: null };
}

function toAccounts(rows: CanonicalAccountRow[]): LoadedJournalAccount[] {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.account_type || "personal",
    baseCurrency: row.base_currency || "USD",
    beginningBalance: 0,
    reportedBalance: 0,
    reportedAsOf: new Date().toISOString(),
  }));
}

export function graphRowsFromPayload(
  payload: JournalSavePayload,
  userId: string,
  options?: { accountId?: string; playbookId?: string },
): {
  trade: CanonicalTradeRow;
  plan: CanonicalPlanRow;
  account: CanonicalAccountRow;
  playbook: CanonicalPlaybookRow | null;
  legs: CanonicalLegRow[];
  executions: CanonicalExecutionRow[];
  fees: CanonicalFeeRow[];
  calculation: CanonicalCalculationRow;
} {
  const accountId = options?.accountId || payload.trade.account_id || payload.account.id || "00000000-0000-4000-8000-000000000001";
  const playbook = payload.trade.playbook_name
    ? {
        id: options?.playbookId || payload.trade.playbook_id || "00000000-0000-4000-8000-0000000000pb",
        name: payload.trade.playbook_name,
        user_id: userId,
      }
    : null;
  const playbookId = playbook?.id ?? null;
  const tradeId = payload.trade.id;
  return {
    trade: {
      id: tradeId,
      user_id: userId,
      symbol: payload.trade.symbol,
      side: payload.trade.side,
      qty: payload.trade.qty,
      entry_price: payload.trade.entry_price,
      exit_price: payload.trade.exit_price,
      entry_date: payload.trade.entry_date,
      exit_date: payload.trade.exit_date,
      status: payload.trade.status,
      stop_price: payload.trade.stop_price,
      target_price: payload.trade.target_price,
      setup_tag: payload.trade.setup_tag,
      lifecycle_status: payload.trade.lifecycle_status,
      account_id: accountId,
      asset_class: payload.trade.asset_class,
      instrument: payload.trade.instrument,
      direction: payload.trade.direction,
      playbook_id: playbookId,
      thesis: payload.trade.thesis,
      planned_entry: payload.trade.planned_entry,
      planned_stop: payload.trade.planned_stop,
      planned_target: payload.trade.planned_target,
      planned_size: payload.trade.planned_size,
      planned_risk: payload.trade.planned_risk,
      session_date: payload.trade.session_date,
      timezone: payload.trade.timezone,
      reviewed_at: payload.trade.reviewed_at,
      calculation_version: payload.trade.calculation_version,
      source: payload.trade.source,
      import_job_id: payload.trade.import_job_id,
    },
    plan: {
      trade_id: tradeId,
      planned_entry: payload.plan.planned_entry,
      planned_stop: payload.plan.planned_stop,
      planned_target: payload.plan.planned_target,
      planned_size: payload.plan.planned_size,
      planned_risk: payload.plan.planned_risk,
      thesis: payload.plan.thesis,
    },
    account: {
      id: accountId,
      name: payload.account.name,
      account_type: "personal",
      base_currency: "USD",
      is_primary: true,
      user_id: userId,
    },
    playbook,
    legs: payload.legs.map((leg) => ({
      id: leg.id,
      trade_id: tradeId,
      action: leg.action,
      right: leg.right,
      strike: leg.strike,
      expiration: leg.expiration,
      contracts: leg.contracts,
      multiplier: leg.multiplier,
      occ_symbol: leg.occ_symbol,
      status: leg.status,
      sequence_index: leg.sequence_index,
    })),
    executions: payload.executions.map((execution) => ({
      id: execution.id,
      trade_id: tradeId,
      occurred_at: execution.occurred_at,
      occurred_at_utc: execution.occurred_at_utc,
      timezone: execution.timezone,
      action: execution.action,
      quantity: execution.quantity,
      price: execution.price,
      multiplier: execution.multiplier,
      commission: execution.commission,
      regulatory_fee: execution.regulatory_fee,
      other_fee: execution.other_fee,
      fee_currency: execution.fee_currency,
      venue: execution.venue,
      order_type: execution.order_type,
      source: execution.source,
      external_execution_id: execution.external_execution_id,
      idempotency_key: execution.idempotency_key,
      import_job_id: execution.import_job_id,
      note: execution.note,
      leg_id: execution.leg_id,
      sequence_index: execution.sequence_index,
    })),
    fees: payload.executions.flatMap((execution) =>
      execution.fees.map((fee, index) => ({
        id: `${execution.id}-fee-${index}`,
        execution_id: execution.id,
        kind: fee.kind,
        amount: fee.amount,
        currency: fee.currency,
        native_amount: fee.native_amount,
        native_currency: fee.native_currency,
        conversion_rate: fee.conversion_rate,
        conversion_timestamp: fee.conversion_timestamp,
        conversion_source: fee.conversion_source,
        account_currency_amount: fee.account_currency_amount,
      })),
    ),
    calculation: {
      trade_id: tradeId,
      calculation_version: payload.calculation.calculation_version,
      input_version: payload.calculation.input_version,
      state: payload.calculation.state,
    },
  };
}

export async function loadJournalGraph(options: LoadJournalOptions): Promise<LoadJournalResult> {
  if (options.mode === "demo") {
    return { ok: true, skipped: "demo", trades: [], accounts: [], path: "canonical" };
  }
  if (!options.userId) {
    return { ok: false, error: "an authenticated session is required.", trades: [], accounts: [] };
  }

  const tradesResult = await readTable(options.client, "journal_trades", (query) =>
    query.eq("user_id", options.userId).order("entry_date", { ascending: false }),
  );
  if (tradesResult.error) {
    if (isMissingRelation(tradesResult.error.message, tradesResult.error.code)) {
      return { ok: false, error: tradesResult.error.message, trades: [], accounts: [] };
    }
    return { ok: false, error: tradesResult.error.message, trades: [], accounts: [] };
  }

  const tradeRows = (tradesResult.data as CanonicalTradeRow[]).filter((row) => !isDemoTradeId(row.id));
  const tradeIds = tradeRows.map((row) => row.id);

  const scopedResults = await Promise.all(
    USER_SCOPED_TABLES.map(async (table) => ({
      table,
      ...(await readTable(options.client, table, (query) => query.eq("user_id", options.userId))),
    })),
  );
  const unexpectedScoped = scopedResults.find((result) => result.error && isUnexpectedDbError(result.error.message, result.error.code));
  if (unexpectedScoped?.error) {
    return { ok: false, error: unexpectedScoped.error.message, trades: [], accounts: [] };
  }

  const childResults = await Promise.all(
    TRADE_CHILD_TABLES.map(async (table) => {
      if (tradeIds.length === 0) {
        return { table, data: [] as unknown[], error: null };
      }
      return { table, ...(await readTable(options.client, table, (query) => query.in("trade_id", tradeIds))) };
    }),
  );
  const unexpectedChild = childResults.find((result) => result.error && isUnexpectedDbError(result.error.message, result.error.code));
  if (unexpectedChild?.error) {
    return { ok: false, error: unexpectedChild.error.message, trades: [], accounts: [] };
  }

  const accountsResult = scopedResults.find((result) => result.table === "journal_accounts");
  const accountRows = (
    !accountsResult?.error ? (accountsResult?.data as CanonicalAccountRow[] | null) : null
  ) ?? [];
  const playbooksResult = scopedResults.find((result) => result.table === "journal_playbooks");
  const playbookRows = (
    !playbooksResult?.error ? (playbooksResult?.data as CanonicalPlaybookRow[] | null) : null
  ) ?? [];
  const executionsResult = childResults.find((result) => result.table === "journal_executions");
  const executionsMissing = Boolean(
    executionsResult?.error && isMissingRelation(executionsResult.error.message, executionsResult.error.code),
  );

  if (executionsMissing) {
    return {
      ok: true,
      path: "legacy_fallback",
      trades: tradeRows.map((row) => mapLegacyTrade(row as LegacyJournalTradeRow)),
      accounts: accountRows.length > 0 ? toAccounts(accountRows) : [],
      hydration: tradeRows.map(() => "legacy_fallback" as const),
    };
  }

  const rowsOrEmpty = (table: string): unknown[] => {
    const result = childResults.find((item) => item.table === table);
    if (result?.error && isMissingRelation(result.error.message, result.error.code)) return [];
    return result?.data ?? [];
  };

  const executionRows = rowsOrEmpty("journal_executions") as CanonicalExecutionRow[];
  const calculationRows = rowsOrEmpty("journal_calculation_runs") as CanonicalCalculationRow[];
  const executionIds = executionRows.map((row) => row.id);
  const calculationIds = calculationRows.map((row) => row.id).filter((id): id is string => Boolean(id));

  const feesResult = executionIds.length
    ? await readTable(options.client, "journal_execution_fees", (query) => query.in("execution_id", executionIds))
    : { data: [] as unknown[], error: null };
  if (feesResult.error && isUnexpectedDbError(feesResult.error.message, feesResult.error.code)) {
    return { ok: false, error: feesResult.error.message, trades: [], accounts: [] };
  }
  const feeRows = feesResult.error && isMissingRelation(feesResult.error.message, feesResult.error.code)
    ? []
    : ((feesResult.data as CanonicalFeeRow[] | null) ?? []);

  const lineageResult = calculationIds.length
    ? await readTable(options.client, "journal_calculation_lineage", (query) => query.in("calculation_run_id", calculationIds))
    : { data: [] as unknown[], error: null };
  if (lineageResult.error && isUnexpectedDbError(lineageResult.error.message, lineageResult.error.code)) {
    return { ok: false, error: lineageResult.error.message, trades: [], accounts: [] };
  }

  const graphs = assembleTradeGraphs({
    trades: tradeRows,
    plans: rowsOrEmpty("journal_trade_plans") as CanonicalPlanRow[],
    accounts: accountRows,
    playbooks: playbookRows,
    legs: rowsOrEmpty("journal_trade_legs") as CanonicalLegRow[],
    executions: executionRows,
    fees: feeRows,
    calculations: calculationRows,
  });
  const hydrated = graphs.map(hydrateTradeGraph);
  return {
    ok: true,
    path: "canonical",
    trades: hydrated.map((item) => item.trade),
    accounts: toAccounts(accountRows),
    hydration: hydrated.map((item) => item.source),
  };
}
