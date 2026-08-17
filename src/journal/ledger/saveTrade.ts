import { calculatePosition, calculateTrade } from "../calc";
import { isDemoTradeId, tradeToLegacyInsert } from "../lib/storage";
import type { ExecutionInput, TradeInput } from "../calc/types";

export interface JournalDb {
  from: (table: string) => JournalQuery;
}

export interface JournalQuery {
  insert: (rows: unknown) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> & JournalQuery;
  select: (cols?: string) => JournalQuery;
  delete: () => JournalQuery;
  eq: (col: string, value: string) => JournalQuery;
  in: (col: string, values: string[]) => JournalQuery;
}

export interface SaveTradeOptions {
  mode: "demo" | "live" | "empty";
  userId: string;
  client: JournalDb;
}

export interface SaveTradeResult {
  ok: boolean;
  skipped?: "demo";
  error?: string;
  tradeId?: string;
}

function isDemoScoped(trade: TradeInput): boolean {
  return isDemoTradeId(trade.id) || trade.accountId.startsWith("demo-") || trade.id.startsWith("demo");
}

export async function saveTrade(trade: TradeInput, options: SaveTradeOptions): Promise<SaveTradeResult> {
  if (options.mode === "demo" || isDemoScoped(trade)) {
    return { ok: false, skipped: "demo" };
  }
  const preview = calculatePosition(trade);
  if (preview.overExitBlocked) {
    return { ok: false, error: "over_exit_blocked" };
  }
  const calc = calculateTrade(trade);
  const row = { id: trade.id, ...tradeToLegacyInsert(trade, options.userId) };

  const execRows = trade.executions.map((execution) => executionRow(trade.id, options.userId, execution));
  const withExec = await tryInsert(options.client, "journal_trades", row);
  if (!withExec.ok) return withExec;

  const execInsert = await tryInsert(options.client, "journal_executions", execRows);
  if (!execInsert.ok && isMissingTable(execInsert.error)) {
    return { ok: true, tradeId: trade.id };
  }
  if (!execInsert.ok) return execInsert;
  return { ok: true, tradeId: calc.tradeId };
}

function executionRow(tradeId: string, userId: string, execution: ExecutionInput) {
  return {
    trade_id: tradeId,
    user_id: userId,
    id: execution.id,
    timestamp_utc: execution.timestampUtc,
    action: execution.action,
    quantity: execution.quantity,
    price: execution.price,
    commission: execution.commission ?? 0,
    regulatory_fee: execution.regulatoryFee ?? 0,
    other_fee: execution.otherFee ?? 0,
    multiplier: execution.multiplier ?? 1,
    external_execution_id: execution.externalExecutionId ?? null,
    import_job_id: execution.importJobId ?? null,
  };
}

async function tryInsert(client: JournalDb, table: string, rows: unknown): Promise<SaveTradeResult> {
  const result = await client.from(table).insert(rows);
  if (result.error) return { ok: false, error: result.error.message };
  return { ok: true };
}

function isMissingTable(message?: string): boolean {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("does not exist") || lower.includes("schema cache") || lower.includes("could not find");
}
