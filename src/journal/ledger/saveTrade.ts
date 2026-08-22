import { calculatePosition, calculateTrade } from "../calc";
import { isDemoTradeId } from "../lib/storage";
import type { TradeInput } from "../calc/types";
import { buildJournalSavePayload, JOURNAL_SAVE_RPC } from "./persist-contract";

export interface JournalQuery {
  insert: (rows: unknown) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> & JournalQuery;
  select: (cols?: string) => JournalQuery;
  delete: () => JournalQuery;
  eq: (col: string, value: string) => JournalQuery;
  in: (col: string, values: string[]) => JournalQuery;
  order: (col: string, opts?: { ascending?: boolean }) => JournalQuery;
  limit: (n: number) => JournalQuery;
}

export interface JournalDb {
  from: (table: string) => JournalQuery;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
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

export { JOURNAL_SAVE_RPC };

function isDemoScoped(trade: TradeInput): boolean {
  return isDemoTradeId(trade.id) || trade.accountId.startsWith("demo-") || trade.id.startsWith("demo");
}

function failure(detail: string): SaveTradeResult {
  return {
    ok: false,
    error: `Trade was not saved: ${detail} No journal records were written.`,
  };
}

function rpcSucceeded(data: unknown): { ok: true; tradeId: string } | { ok: false } {
  if (!data || typeof data !== "object") return { ok: false };
  const row = data as { ok?: unknown; trade_id?: unknown };
  if (row.ok === false) return { ok: false };
  if (typeof row.trade_id === "string" && row.trade_id.length > 0) {
    return { ok: true, tradeId: row.trade_id };
  }
  return { ok: false };
}

export async function saveTrade(trade: TradeInput, options: SaveTradeOptions): Promise<SaveTradeResult> {
  if (options.mode === "demo" || isDemoScoped(trade)) {
    return { ok: false, skipped: "demo" };
  }
  if (!options.userId) {
    return failure("an authenticated session is required.");
  }
  const preview = calculatePosition(trade);
  if (preview.overExitBlocked) {
    return { ok: false, error: "over_exit_blocked" };
  }
  calculateTrade(trade);
  const payload = buildJournalSavePayload(trade);
  if (typeof options.client.rpc !== "function") {
    return failure("the atomic persistence RPC is unavailable.");
  }

  const result = await options.client.rpc(JOURNAL_SAVE_RPC, { p_payload: payload });
  if (result.error) {
    return failure(result.error.message.endsWith(".") ? result.error.message : `${result.error.message}.`);
  }
  const confirmed = rpcSucceeded(result.data);
  if (!confirmed.ok) {
    return failure("the database did not confirm the trade save.");
  }
  return { ok: true, tradeId: confirmed.tradeId };
}
