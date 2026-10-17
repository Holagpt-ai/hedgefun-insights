import { getEtParts } from "@/lib/market-calendar";
import { calculateTrade, validateSymbol } from "../calc";
import { normalizeLegacyStatus, normalizeSetupTag } from "../ledger/persist-contract";
import type { AssetClass, Direction, ExecutionInput, TradeInput } from "../calc/types";

export const HIDE_DEMO_KEY = "stocksist-journal-hide-demo";
export const FILTERS_KEY = "stocksist-journal-filters";
export const DRAFT_KEY = "stocksist-journal-trade-draft";
export const ONBOARDING_KEY = "stocksist-journal-onboarding";
export const SETTINGS_KEY = "stocksist-journal-settings";
export const NOTEBOOK_KEY = "stocksist-journal-notebook";
export const REPORTS_KEY = "stocksist-journal-report-runs";
export const IMPORT_JOBS_KEY = "stocksist-journal-import-jobs";
export const REST_DAYS_KEY = "stocksist-journal-rest-days";

export function isDemoTradeId(id: string): boolean {
  return id.startsWith("demo-");
}

export function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota / private mode — ignore without throwing.
  }
}

export function userStorageKey(baseKey: string, userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `${baseKey}:${userId}`;
}

export function readUserJson<T>(baseKey: string, userId: string | null | undefined, fallback: T): T {
  const scoped = userStorageKey(baseKey, userId);
  if (!scoped) return fallback;
  return readJson(scoped, fallback);
}

export function writeUserJson(baseKey: string, userId: string | null | undefined, value: unknown): void {
  const scoped = userStorageKey(baseKey, userId);
  if (!scoped) return;
  writeJson(scoped, value);
}

export interface FilterPrefs {
  accountId: string;
  range: "augustDemo" | "today" | "mtd" | "week" | "month" | "ytd" | "all";
  asset: "all" | AssetClass;
}

/** Demo workspace default — August range only applies in demo mode. */
export const DEFAULT_FILTERS: FilterPrefs = {
  accountId: "all",
  range: "augustDemo",
  asset: "all",
};

/** Live authenticated Journal default. */
export const DEFAULT_LIVE_FILTERS: FilterPrefs = {
  accountId: "all",
  range: "mtd",
  asset: "all",
};

export function sanitizeLiveFilters(
  filters: FilterPrefs,
  accountIds: readonly string[],
  mode: "demo" | "live" | "empty",
  options?: { validateAccountIds?: boolean },
): FilterPrefs {
  let next = filters;
  if (mode !== "demo" && next.range === "augustDemo") {
    next = { ...next, range: DEFAULT_LIVE_FILTERS.range };
  }
  const validateAccounts = options?.validateAccountIds ?? true;
  if (
    validateAccounts &&
    next.accountId !== "all" &&
    !accountIds.includes(next.accountId)
  ) {
    next = { ...next, accountId: "all" };
  }
  return next;
}

function shiftEtDate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/** Exchange-local ET session dates for Journal trade filters. */
export function rangeBounds(range: FilterPrefs["range"], now = new Date()): { from: string; to: string } {
  if (range === "augustDemo") return { from: "2026-08-01", to: "2026-08-31" };
  if (range === "all") return { from: "1970-01-01", to: "9999-12-31" };

  const et = getEtParts(now);
  const to = et.date;

  if (range === "today") return { from: to, to };

  if (range === "week") {
    const mondayOffset = et.weekday === 0 ? 6 : et.weekday - 1;
    return { from: shiftEtDate(to, -mondayOffset), to };
  }

  if (range === "month" || range === "mtd") {
    return { from: `${to.slice(0, 7)}-01`, to };
  }

  return { from: `${to.slice(0, 4)}-01-01`, to };
}

export interface LegacyJournalTradeRow {
  id: string;
  user_id: string;
  symbol: string;
  side: string;
  qty: number;
  entry_price: number;
  exit_price: number | null;
  entry_date: string;
  exit_date: string | null;
  status: string;
  stop_price: number | null;
  target_price: number | null;
  setup_tag: string | null;
  lifecycle_status?: string | null;
  account_id?: string | null;
  asset_class?: string | null;
  instrument?: string | null;
  playbook_id?: string | null;
  thesis?: string | null;
  planned_entry?: number | null;
  planned_stop?: number | null;
  planned_target?: number | null;
  planned_size?: number | null;
  planned_risk?: number | null;
  session_date?: string | null;
}

export function mapLegacyTrade(row: LegacyJournalTradeRow): TradeInput {
  const direction: Direction = row.side === "short" ? "short" : "long";
  const executions: ExecutionInput[] = [
    {
      id: `${row.id}-in`,
      timestamp: row.entry_date,
      timestampUtc: new Date(row.entry_date).toISOString(),
      originalTimezone: "America/New_York",
      action: direction === "long" ? "buy" : "short",
      quantity: row.qty,
      price: row.entry_price,
    },
  ];
  if (row.exit_price != null && row.exit_date) {
    executions.push({
      id: `${row.id}-out`,
      timestamp: row.exit_date,
      timestampUtc: new Date(row.exit_date).toISOString(),
      originalTimezone: "America/New_York",
      action: direction === "long" ? "sell" : "cover",
      quantity: row.qty,
      price: row.exit_price,
    });
  }
  const symbol = validateSymbol(row.symbol) ?? row.symbol.toUpperCase();
  const inferred: TradeInput["status"] = row.exit_price != null ? "closed" : "open";
  return {
    id: row.id,
    accountId: row.account_id || "live-default",
    assetClass: (row.asset_class as TradeInput["assetClass"]) || "stock",
    instrument: row.instrument || "share",
    symbol,
    direction,
    status: (row.lifecycle_status as TradeInput["status"]) || (row.status as TradeInput["status"]) || inferred,
    executions,
    sessionDate: row.session_date || row.entry_date.slice(0, 10),
    plannedEntry: row.planned_entry,
    plannedStop: row.planned_stop ?? row.stop_price,
    plannedTarget: row.planned_target ?? row.target_price,
    plannedSize: row.planned_size ?? row.qty,
    plannedRisk: row.planned_risk,
    playbookId: row.playbook_id,
    playbookName: row.setup_tag,
    thesis: row.thesis,
    reviewed: Boolean(row.exit_date),
  };
}

export function tradeToLegacyInsert(trade: TradeInput, userId: string) {
  const calc = calculateTrade(trade);
  const first = trade.executions[0];
  const last = trade.executions.at(-1);
  return {
    user_id: userId,
    symbol: trade.symbol,
    side: trade.direction,
    qty: Number(trade.plannedSize ?? first?.quantity ?? 0),
    entry_price: calc.weightedAverageEntry != null ? Number(calc.weightedAverageEntry) / 1_000_000 : Number(first?.price ?? 0),
    exit_price: calc.remainingQuantity === 0n && calc.weightedAverageExit != null
      ? Number(calc.weightedAverageExit) / 1_000_000
      : null,
    entry_date: first?.timestampUtc ?? new Date().toISOString(),
    exit_date: calc.remainingQuantity === 0n ? last?.timestampUtc ?? null : null,
    status: normalizeLegacyStatus(calc.status, calc.remainingQuantity === 0n),
    stop_price: trade.plannedStop != null ? Number(trade.plannedStop) : null,
    target_price: trade.plannedTarget != null ? Number(trade.plannedTarget) : null,
    setup_tag: normalizeSetupTag(trade.playbookName),
    return_dollars: Number(calc.netRealizedPnl) / 1_000_000,
    hold_duration_minutes: calc.holdingDurationMinutes,
  };
}
