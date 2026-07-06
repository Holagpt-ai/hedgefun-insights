import { useEffect, useState } from "react";
import { Pencil, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import EmptyJournalState from "@/components/journal/EmptyJournalState";
import SetupTagBadge from "@/components/journal/SetupTagBadge";

export type Trade = {
  id: string;
  symbol: string;
  side: "long" | "short";
  status: "open" | "closed" | "cancelled";
  qty: number;
  entry_price: number;
  exit_price: number | null;
  entry_date: string;
  exit_date: string | null;
  return_dollars: number | null;
  return_pct: number | null;
  setup_tag: string | null;
  is_wash: boolean;
};

type Props = {
  userId: string;
  onEdit: (trade: Trade) => void;
  refreshKey: number;
  filterStatus?: "open" | "closed" | "cancelled";
  onAskAI?: (trade: Trade) => void;
};

const fmtDate = (s: string) =>
  new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const fmtMoney = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function TradeTable({ userId, onEdit, refreshKey, filterStatus, onAskAI }: Props) {
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      setTrades(null);
      setFetchError(null);
      let q = supabase
        .from("journal_trades")
        .select("*")
        .eq("user_id", userId)
        .order("entry_date", { ascending: false });
      if (filterStatus) q = q.eq("status", filterStatus);
      const { data, error } = await q;
      if (!active) return;
      if (error) {
        setFetchError(error.message ?? "Fetch failed");
        setTrades([]);
        return;
      }
      setTrades((data ?? []) as unknown as Trade[]);
    })();
    return () => {
      active = false;
    };
  }, [userId, refreshKey, filterStatus]);

  const handleDelete = async (trade: Trade) => {
    setDeletingId(trade.id);
    const { error } = await supabase.from("journal_trades").delete().eq("id", trade.id);
    setDeletingId(null);
    if (error) {
      toast.error("Failed to delete trade.");
      return;
    }
    // Optimistic removal from local state
    setTrades((prev) => (prev ? prev.filter((t) => t.id !== trade.id) : prev));
    setConfirmDeleteId(null);
    toast.success("Trade deleted.");
  };

  if (trades === null) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (fetchError) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Unable to load trades. Please try again.
      </p>
    );
  }

  if (trades.length === 0) return <EmptyJournalState />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground uppercase tracking-wide text-xs">
            <th className="text-left py-2 px-2 font-medium">Date</th>
            <th className="text-left py-2 px-2 font-medium">Symbol</th>
            <th className="text-left py-2 px-2 font-medium">Side</th>
            <th className="text-right py-2 px-2 font-medium">Qty</th>
            <th className="text-right py-2 px-2 font-medium">Entry</th>
            <th className="text-right py-2 px-2 font-medium">Exit</th>
            <th className="text-right py-2 px-2 font-medium">Return</th>
            <th className="text-left py-2 px-2 font-medium">Setup</th>
            <th className="text-left py-2 px-2 font-medium">Status</th>
            <th className="py-2 px-2" />
          </tr>
        </thead>
        <tbody>
          {trades.map((t) => {
            const ret = t.return_dollars;
            const pct = t.return_pct;
            const isOpen = ret === null;
            const positive = ret !== null && ret >= 0;
            const isConfirming = confirmDeleteId === t.id;
            return (
              <tr
                key={t.id}
                className="border-b border-border hover:bg-muted/30 transition-colors"
              >
                <td className="py-2 px-2 text-muted-foreground">{fmtDate(t.entry_date)}</td>
                <td className="py-2 px-2 font-bold uppercase text-primary cursor-pointer">
                  {t.symbol}
                </td>
                <td className="py-2 px-2">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      t.side === "long"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-red-500/15 text-red-400"
                    }`}
                  >
                    {t.side.toUpperCase()}
                  </span>
                </td>
                <td className="py-2 px-2 text-right tabular-nums">{t.qty}</td>
                <td className="py-2 px-2 text-right tabular-nums">{fmtMoney(t.entry_price)}</td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {t.exit_price !== null ? fmtMoney(t.exit_price) : "—"}
                </td>
                <td
                  className={`py-2 px-2 text-right tabular-nums ${
                    isOpen ? "text-muted-foreground" : positive ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {isOpen
                    ? "Open"
                    : `${positive ? "+" : ""}${fmtMoney(ret!)} · ${
                        pct !== null ? `${pct.toFixed(1)}%` : ""
                      }`}
                </td>
                <td className="py-2 px-2">
                  <SetupTagBadge setupTag={t.setup_tag} />
                </td>
                <td className="py-2 px-2">
                  <span
                    className={`text-xs font-medium ${
                      t.status === "open"
                        ? "text-yellow-400"
                        : t.status === "closed"
                        ? "text-muted-foreground"
                        : "text-zinc-500"
                    }`}
                  >
                    {t.status.charAt(0).toUpperCase() + t.status.slice(1)}
                  </span>
                </td>
                <td className="py-2 px-2 text-right">
                  {isConfirming ? (
                    <div className="inline-flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Delete?</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(t)}
                        disabled={deletingId === t.id}
                        className="text-red-400 hover:text-red-300 font-medium px-1.5 py-0.5 rounded transition-colors disabled:opacity-50"
                      >
                        {deletingId === t.id ? "..." : "Yes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        disabled={deletingId === t.id}
                        className="text-muted-foreground hover:text-foreground font-medium px-1.5 py-0.5 rounded transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1">
                      <button
                        onClick={() => onEdit(t)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Edit trade"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {onAskAI && t.status === "closed" && (
                        <button
                          onClick={() => onAskAI(t)}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-accent-blue transition-colors"
                          aria-label="Ask AI about trade"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => setConfirmDeleteId(t.id)}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-red-400 transition-colors"
                        aria-label="Delete trade"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
