import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { ToolDefinition, ToolHandler, ToolResult } from "./types.ts";

// --- get_journal_stats ---

export const getJournalStatsDefinition: ToolDefinition = {
  name: "get_journal_stats",
  description:
    "Retrieves the user's aggregated trading performance statistics from their journal: total trades, win rate, average win/loss in dollars, total P&L, largest win, largest loss, and the period covered. Use this when the user asks about their overall performance, win rate, or trading summary.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

export const getJournalStatsHandler: ToolHandler = async (
  userId: string,
  supabase: SupabaseClient,
  _params: Record<string, unknown>
): Promise<ToolResult> => {
  const { data, error } = await supabase
    .from("journal_stats_cache")
    .select(
      "total_trades, wins, losses, win_rate, avg_win_dollars, avg_loss_dollars, total_pnl, largest_win, largest_loss, period_start, period_end, updated_at"
    )
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) {
    return { content: "No journal stats found for this user." };
  }

  const stats = {
    total_trades: data.total_trades,
    wins: data.wins,
    losses: data.losses,
    win_rate: data.win_rate !== null ? Number(data.win_rate) : null,
    avg_win_dollars:
      data.avg_win_dollars !== null ? Number(data.avg_win_dollars) : null,
    avg_loss_dollars:
      data.avg_loss_dollars !== null ? Number(data.avg_loss_dollars) : null,
    total_pnl: data.total_pnl !== null ? Number(data.total_pnl) : null,
    largest_win:
      data.largest_win !== null ? Number(data.largest_win) : null,
    largest_loss:
      data.largest_loss !== null ? Number(data.largest_loss) : null,
    period_start: data.period_start,
    period_end: data.period_end,
  };

  return { content: JSON.stringify(stats) };
};

// --- get_recent_trades ---

export const getRecentTradesDefinition: ToolDefinition = {
  name: "get_recent_trades",
  description:
    "Retrieves the user's most recent trades (up to 20) from their journal, including symbol, side (long/short), entry/exit prices, return in dollars and percent, hold duration, and setup tag. Use this when the user asks about specific trades, recent activity, setups they've traded, or patterns in their trading history.",
  input_schema: {
    type: "object",
    properties: {},
    required: [],
  },
};

export const getRecentTradesHandler: ToolHandler = async (
  userId: string,
  supabase: SupabaseClient,
  _params: Record<string, unknown>
): Promise<ToolResult> => {
  const { data, error } = await supabase
    .from("journal_trades")
    .select(
      "symbol, side, status, qty, entry_price, exit_price, entry_date, exit_date, return_dollars, return_pct, hold_duration_minutes, setup_tag, is_wash"
    )
    .eq("user_id", userId)
    .order("entry_date", { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) {
    return { content: "No trades found." };
  }

  const trades = data.map((t) => ({
    symbol: t.symbol,
    side: t.side,
    status: t.status,
    qty: t.qty !== null ? Number(t.qty) : null,
    entry_price: t.entry_price !== null ? Number(t.entry_price) : null,
    exit_price: t.exit_price !== null ? Number(t.exit_price) : null,
    entry_date: t.entry_date,
    exit_date: t.exit_date,
    return_dollars:
      t.return_dollars !== null ? Number(t.return_dollars) : null,
    return_pct: t.return_pct !== null ? Number(t.return_pct) : null,
    hold_duration_minutes: t.hold_duration_minutes,
    setup_tag: t.setup_tag,
    is_wash: t.is_wash,
  }));

  return { content: JSON.stringify(trades) };
};

function scopedTradeQuery(supabase: SupabaseClient, userId: string) {
  return supabase.from("journal_trades").select("*").eq("user_id", userId);
}

export const getTradeDefinition: ToolDefinition = {
  name: "get_trade",
  description:
    "Retrieves one of the authenticated user's journal trades by id, including symbol, executions summary, status, and stored P&L. Never invents prices or P&L.",
  input_schema: {
    type: "object",
    properties: { trade_id: { type: "string" } },
    required: ["trade_id"],
  },
};

export const getTradeHandler: ToolHandler = async (userId, supabase, params) => {
  const tradeId = String(params.trade_id ?? "");
  if (!tradeId) return { content: "trade_id is required.", isError: true };
  const { data, error } = await scopedTradeQuery(supabase, userId).eq("id", tradeId).maybeSingle();
  if (error || !data) return { content: "Trade not found for this user." };
  return { content: JSON.stringify(data) };
};

export const getSessionSummaryDefinition: ToolDefinition = {
  name: "get_session_summary",
  description:
    "Summarizes the authenticated user's closed journal trades for a session date (YYYY-MM-DD) using stored ledger fields only.",
  input_schema: {
    type: "object",
    properties: { session_date: { type: "string" } },
    required: ["session_date"],
  },
};

export const getSessionSummaryHandler: ToolHandler = async (userId, supabase, params) => {
  const sessionDate = String(params.session_date ?? "");
  const { data, error } = await scopedTradeQuery(supabase, userId)
    .gte("entry_date", `${sessionDate}T00:00:00`)
    .lte("entry_date", `${sessionDate}T23:59:59`);
  if (error) return { content: "Unable to load session trades." };
  const rows = data ?? [];
  const closed = rows.filter((row) => row.status === "closed");
  const net = closed.reduce((sum, row) => sum + Number(row.return_dollars ?? 0), 0);
  return {
    content: JSON.stringify({
      session_date: sessionDate,
      trade_count: rows.length,
      closed_count: closed.length,
      net_pnl: net,
      source: "journal_trades",
      note: "Values are ledger-stored. AI must not invent missing prices.",
    }),
  };
};

export const getPerformanceMetricsDefinition: ToolDefinition = {
  name: "get_performance_metrics",
  description: "Returns cached deterministic journal stats for the authenticated user.",
  input_schema: { type: "object", properties: {}, required: [] },
};

export const getPerformanceMetricsHandler: ToolHandler = async (userId, supabase) => {
  return getJournalStatsHandler(userId, supabase, {});
};

export const getDataQualityDefinition: ToolDefinition = {
  name: "get_data_quality",
  description: "Lists open data-quality issues for the authenticated user. Does not invent issues.",
  input_schema: { type: "object", properties: {}, required: [] },
};

export const getDataQualityHandler: ToolHandler = async (userId, supabase) => {
  const { data, error } = await supabase
    .from("journal_data_quality_issues")
    .select("id, issue_type, severity, entity_id, explanation, created_at")
    .eq("user_id", userId)
    .is("resolved_at", null)
    .limit(50);
  if (error) return { content: JSON.stringify({ issues: [], note: "Data quality table unavailable." }) };
  return { content: JSON.stringify({ issues: data ?? [] }) };
};

export const getRelevantMemoriesDefinition: ToolDefinition = {
  name: "get_relevant_memories",
  description: "Returns confirmed AI memories for the authenticated user. Demo data is never stored as memory.",
  input_schema: { type: "object", properties: {}, required: [] },
};

export const getRelevantMemoriesHandler: ToolHandler = async (userId, supabase) => {
  const { data, error } = await supabase
    .from("journal_ai_memories")
    .select("id, category, claim, status, confidence, created_at")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .limit(25);
  if (error) return { content: JSON.stringify({ memories: [] }) };
  return { content: JSON.stringify({ memories: data ?? [] }) };
};

