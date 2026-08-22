import { isUuid } from "../ledger/persist-contract";
import { deleteAttachmentsForTrade } from "./attachments-service";
import {
  isWriteBlocked,
  queryError,
  rowsOf,
  withWriteLock,
  type LiveWriteOptions,
} from "./live-client";
import { isDemoTradeId } from "./storage";

export interface DeleteResult {
  ok: boolean;
  skipped?: "demo";
  error?: string;
  code?: "not_found" | "denied" | "not_empty" | "symbol_mismatch" | "name_mismatch";
}

const ACCOUNT_DEPENDENCIES = [
  { table: "journal_trades", column: "account_id" },
  { table: "journal_cash_ledger_entries", column: "account_id" },
  { table: "journal_account_balance_snapshots", column: "account_id" },
  { table: "journal_balance_reconciliations", column: "account_id" },
  { table: "journal_sessions", column: "account_id" },
  { table: "journal_valuation_snapshots", column: "account_id" },
  { table: "journal_goals", column: "account_id" },
  { table: "journal_risk_rules", column: "account_id" },
  { table: "journal_risk_violations", column: "account_id" },
  { table: "journal_provider_accounts", column: "account_id" },
] as const;

function normalizeConfirm(value: string): string {
  return value.trim().toUpperCase();
}

export async function deleteOwnedTrade(
  options: LiveWriteOptions,
  input: { tradeId: string; symbol: string; confirmSymbol: string },
): Promise<DeleteResult> {
  if (isWriteBlocked(options.mode)) return { ok: false, skipped: "demo" };
  if (!options.userId) return { ok: false, error: "an authenticated session is required." };
  if (!isUuid(input.tradeId) || isDemoTradeId(input.tradeId)) {
    return { ok: false, code: "not_found", error: "not_found" };
  }
  if (normalizeConfirm(input.confirmSymbol) !== normalizeConfirm(input.symbol)) {
    return { ok: false, code: "symbol_mismatch", error: "Symbol does not match." };
  }

  return withWriteLock(`trade-delete:${options.userId}:${input.tradeId}`, async () => {
    const existing = await options.client
      .from("journal_trades")
      .select("id,user_id,symbol")
      .eq("id", input.tradeId)
      .eq("user_id", options.userId)
      .maybeSingle();
    const lookupErr = queryError(existing);
    if (lookupErr) return { ok: false, error: lookupErr };
    const row = existing.data as { id: string; symbol: string } | null;
    if (!row) return { ok: false, code: "not_found", error: "not_found" };
    if (normalizeConfirm(row.symbol) !== normalizeConfirm(input.symbol)) {
      return { ok: false, code: "symbol_mismatch", error: "Symbol does not match." };
    }

    const attachments = await deleteAttachmentsForTrade(options, input.tradeId);
    if (!attachments.ok) return { ok: false, error: attachments.error };

    const deleted = await options.client
      .from("journal_trades")
      .delete()
      .eq("id", input.tradeId)
      .eq("user_id", options.userId);
    const err = queryError(deleted);
    if (err) return { ok: false, error: err };
    return { ok: true };
  });
}

async function accountHasDependents(
  options: LiveWriteOptions,
  accountId: string,
): Promise<{ ok: true; empty: boolean } | { ok: false; error: string }> {
  for (const dep of ACCOUNT_DEPENDENCIES) {
    const result = await options.client.from(dep.table).select("id").eq(dep.column, accountId).limit(1);
    const err = queryError(result);
    if (err) return { ok: false, error: err };
    if (rowsOf<{ id: string }>(result.data).length > 0) return { ok: true, empty: false };
  }
  return { ok: true, empty: true };
}

export async function deleteOwnedAccount(
  options: LiveWriteOptions,
  input: { accountId: string; name: string; confirmName: string },
): Promise<DeleteResult> {
  if (isWriteBlocked(options.mode)) return { ok: false, skipped: "demo" };
  if (!options.userId) return { ok: false, error: "an authenticated session is required." };
  if (!isUuid(input.accountId)) return { ok: false, code: "not_found", error: "not_found" };
  if (input.confirmName.trim() !== input.name.trim()) {
    return { ok: false, code: "name_mismatch", error: "Account name does not match." };
  }

  return withWriteLock(`account-delete:${options.userId}:${input.accountId}`, async () => {
    const existing = await options.client
      .from("journal_accounts")
      .select("id,user_id,name")
      .eq("id", input.accountId)
      .eq("user_id", options.userId)
      .maybeSingle();
    const lookupErr = queryError(existing);
    if (lookupErr) return { ok: false, error: lookupErr };
    const row = existing.data as { id: string; name: string } | null;
    if (!row) return { ok: false, code: "not_found", error: "not_found" };
    if (row.name.trim() !== input.name.trim()) {
      return { ok: false, code: "name_mismatch", error: "Account name does not match." };
    }

    const dependents = await accountHasDependents(options, input.accountId);
    if (dependents.ok === false) return { ok: false, error: dependents.error };
    if (!dependents.empty) {
      return {
        ok: false,
        code: "not_empty",
        error: "This account still has trades, cash records, or other dependent data and cannot be deleted.",
      };
    }

    const deleted = await options.client
      .from("journal_accounts")
      .delete()
      .eq("id", input.accountId)
      .eq("user_id", options.userId);
    const err = queryError(deleted);
    if (err) return { ok: false, error: err };
    return { ok: true };
  });
}
