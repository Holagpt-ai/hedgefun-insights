import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Trade } from "@/components/journal/TradeTable";

type Props = {
  open: boolean;
  onClose: () => void;
  trade: Trade | null;
  onSaved: () => void;
};

const SETUP_OPTIONS = [
  { value: "", label: "Select setup (optional)" },
  { value: "flat_top_breakout", label: "Flat Top Breakout" },
  { value: "bottom_bouncer", label: "Bottom Bouncer" },
  { value: "flat_base_breakout", label: "Flat Base Breakout" },
  { value: "breakout_pullback", label: "Breakout / Pullback" },
  { value: "other", label: "Other" },
];

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function TradeDrawer({ open, onClose, trade, onSaved }: Props) {
  const { user } = useAuth();
  const isEdit = !!trade;

  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"long" | "short">("long");
  const [qty, setQty] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [entryDate, setEntryDate] = useState(todayIso());
  const [exitPrice, setExitPrice] = useState("");
  const [exitDate, setExitDate] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [setupTag, setSetupTag] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (trade) {
      setSymbol(trade.symbol ?? "");
      setSide(trade.side);
      setQty(String(trade.qty ?? ""));
      setEntryPrice(String(trade.entry_price ?? ""));
      setEntryDate(trade.entry_date ? trade.entry_date.slice(0, 10) : todayIso());
      setExitPrice(trade.exit_price !== null ? String(trade.exit_price) : "");
      setExitDate(trade.exit_date ? trade.exit_date.slice(0, 10) : "");
      setTargetPrice("");
      setStopPrice("");
      setSetupTag(trade.setup_tag ?? "");
      setNotes("");
    } else {
      setSymbol("");
      setSide("long");
      setQty("");
      setEntryPrice("");
      setEntryDate(todayIso());
      setExitPrice("");
      setExitDate("");
      setTargetPrice("");
      setStopPrice("");
      setSetupTag("");
      setNotes("");
    }
  }, [open, trade]);

  const handleSave = async () => {
    setError(null);
    const userId = user?.id;
    if (!userId) {
      setError("You must be signed in.");
      return;
    }
    const qtyNum = Number(qty);
    const entryNum = Number(entryPrice);
    if (!symbol.trim() || !side || !qty || !entryPrice || !entryDate) {
      setError("Symbol, side, qty, entry price and entry date are required.");
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0 || !Number.isFinite(entryNum) || entryNum <= 0) {
      setError("Qty and entry price must be positive numbers.");
      return;
    }

    const exitNum = exitPrice ? Number(exitPrice) : null;
    const targetNum = targetPrice ? Number(targetPrice) : null;
    const stopNum = stopPrice ? Number(stopPrice) : null;

    let returnDollars: number | null = null;
    let returnPct: number | null = null;
    if (exitNum !== null) {
      returnDollars =
        side === "long" ? (exitNum - entryNum) * qtyNum : (entryNum - exitNum) * qtyNum;
      returnPct = (returnDollars / (entryNum * qtyNum)) * 100;
    }

    let holdMinutes: number | null = null;
    if (exitDate && entryDate) {
      const diffMs = new Date(exitDate).getTime() - new Date(entryDate).getTime();
      if (Number.isFinite(diffMs) && diffMs >= 0) holdMinutes = Math.round(diffMs / 60000);
    }

    const status: "open" | "closed" = exitNum !== null ? "closed" : "open";

    const payload = {
      user_id: userId,
      symbol: symbol.trim().toUpperCase(),
      side,
      qty: qtyNum,
      entry_price: entryNum,
      entry_date: entryDate,
      exit_price: exitNum,
      exit_date: exitDate || null,
      target_price: targetNum,
      stop_price: stopNum,
      setup_tag: setupTag || null,
      return_dollars: returnDollars,
      return_pct: returnPct,
      hold_duration_minutes: holdMinutes,
      status,
    };

    setSaving(true);
    try {
      let tradeId: string | null = trade?.id ?? null;
      if (isEdit && trade) {
        const { error: upErr } = await supabase
          .from("journal_trades")
          .update(payload)
          .eq("id", trade.id);
        if (upErr) throw upErr;
      } else {
        const { data: ins, error: insErr } = await supabase
          .from("journal_trades")
          .insert(payload)
          .select("id")
          .single();
        if (insErr) throw insErr;
        tradeId = ins?.id ?? null;
      }

      if (notes.trim() && tradeId) {
        await supabase.from("journal_notes").insert({
          user_id: userId,
          trade_id: tradeId,
          note_type: "general",
          body: notes.trim(),
        });
      }

      await supabase.rpc("refresh_journal_stats", { p_user_id: userId });

      toast.success(isEdit ? "Trade updated." : "Trade logged.");
      onSaved();
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to save trade.");
      setError(e?.message ?? "Failed to save trade.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Trade" : "Log Trade"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          <div>
            <label className="text-sm font-medium text-muted-foreground">Symbol</label>
            <Input
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Side</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              <button
                type="button"
                onClick={() => setSide("long")}
                className={`text-sm font-medium py-2 rounded-md border transition-colors ${
                  side === "long"
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                    : "border-border text-muted-foreground hover:bg-muted/40"
                }`}
              >
                LONG
              </button>
              <button
                type="button"
                onClick={() => setSide("short")}
                className={`text-sm font-medium py-2 rounded-md border transition-colors ${
                  side === "short"
                    ? "bg-red-500/15 text-red-400 border-red-500/40"
                    : "border-border text-muted-foreground hover:bg-muted/40"
                }`}
              >
                SHORT
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Qty</label>
            <Input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Entry Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  step="0.01"
                  value={entryPrice}
                  onChange={(e) => setEntryPrice(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Entry Date</label>
              <Input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Exit Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  step="0.01"
                  value={exitPrice}
                  onChange={(e) => setExitPrice(e.target.value)}
                  className="pl-7"
                  placeholder="Leave blank if still open"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Exit Date</label>
              <Input
                type="date"
                value={exitDate}
                onChange={(e) => setExitDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground">Target Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  step="0.01"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground">Stop Price</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  type="number"
                  step="0.01"
                  value={stopPrice}
                  onChange={(e) => setStopPrice(e.target.value)}
                  className="pl-7"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Setup Tag</label>
            <select
              value={setupTag}
              onChange={(e) => setSetupTag(e.target.value)}
              className="w-full mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {SETUP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-muted-foreground">Notes</label>
            <Textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Pre-trade thesis, observations, lessons learned..."
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-accent-blue text-primary-foreground text-sm font-semibold py-2.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {saving ? "Saving..." : isEdit ? "Update Trade" : "Save Trade"}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
