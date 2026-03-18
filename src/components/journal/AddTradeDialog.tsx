import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { TradeInsert, TradeTag } from "@/hooks/useJournalTrades";

const SETUP_TYPES = ["Breakout", "Pullback", "Earnings Play", "Swing", "Scalp", "Gap Fill", "Reversal", "Momentum", "Other"];
const EMOTIONS = [
  { value: 1, label: "😰 Fearful" },
  { value: 2, label: "😟 Anxious" },
  { value: 3, label: "😐 Neutral" },
  { value: 4, label: "😊 Confident" },
  { value: 5, label: "🔥 Very Confident" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (trade: TradeInsert) => void;
  tags: TradeTag[];
  isPending: boolean;
}

export function AddTradeDialog({ open, onClose, onSubmit, tags, isPending }: Props) {
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [exitDate, setExitDate] = useState("");
  const [notes, setNotes] = useState("");
  const [setupType, setSetupType] = useState("");
  const [emotion, setEmotion] = useState<string>("");
  const [confidence, setConfidence] = useState<string>("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const reset = () => {
    setSymbol(""); setSide("buy"); setEntryPrice(""); setExitPrice("");
    setQuantity(""); setEntryDate(new Date().toISOString().split("T")[0]);
    setExitDate(""); setNotes(""); setSetupType(""); setEmotion("");
    setConfidence(""); setSelectedTags([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!symbol || !entryPrice || !quantity) return;
    onSubmit({
      symbol: symbol.toUpperCase().trim(),
      side,
      entry_price: parseFloat(entryPrice),
      exit_price: exitPrice ? parseFloat(exitPrice) : null,
      quantity: parseFloat(quantity),
      entry_date: entryDate,
      exit_date: exitDate || null,
      notes: notes || undefined,
      setup_type: setupType || undefined,
      emotion: emotion ? parseInt(emotion) : undefined,
      confidence: confidence ? parseInt(confidence) : undefined,
      tag_ids: selectedTags.length > 0 ? selectedTags : undefined,
    });
    reset();
  };

  const toggleTag = (id: string) =>
    setSelectedTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log a Trade</DialogTitle>
          <DialogDescription>Record your trade details, reasoning, and emotions.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Row 1: Symbol, Side */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="symbol">Symbol *</Label>
              <Input id="symbol" placeholder="AAPL" value={symbol} onChange={(e) => setSymbol(e.target.value)} required maxLength={10} />
            </div>
            <div>
              <Label>Side *</Label>
              <div className="flex gap-2 mt-1">
                <Button type="button" size="sm" variant={side === "buy" ? "default" : "outline"}
                  className={side === "buy" ? "bg-[hsl(var(--green))] hover:bg-[hsl(var(--green))] text-primary-foreground flex-1" : "flex-1"}
                  onClick={() => setSide("buy")}>Buy</Button>
                <Button type="button" size="sm" variant={side === "sell" ? "default" : "outline"}
                  className={side === "sell" ? "bg-[hsl(var(--red))] hover:bg-[hsl(var(--red))] text-primary-foreground flex-1" : "flex-1"}
                  onClick={() => setSide("sell")}>Sell</Button>
              </div>
            </div>
          </div>

          {/* Row 2: Prices & Quantity */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label htmlFor="entry_price">Entry Price *</Label>
              <Input id="entry_price" type="number" step="0.01" min="0" placeholder="150.00" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="exit_price">Exit Price</Label>
              <Input id="exit_price" type="number" step="0.01" min="0" placeholder="—" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="quantity">Qty *</Label>
              <Input id="quantity" type="number" step="0.01" min="0.01" placeholder="100" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </div>
          </div>

          {/* Row 3: Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="entry_date">Entry Date *</Label>
              <Input id="entry_date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="exit_date">Exit Date</Label>
              <Input id="exit_date" type="date" value={exitDate} onChange={(e) => setExitDate(e.target.value)} />
            </div>
          </div>

          {/* Row 4: Setup & Emotions */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Setup Type</Label>
              <Select value={setupType} onValueChange={setSetupType}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {SETUP_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Emotion</Label>
              <Select value={emotion} onValueChange={setEmotion}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {EMOTIONS.map((e) => <SelectItem key={e.value} value={String(e.value)}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Confidence</Label>
              <Select value={confidence} onValueChange={setConfidence}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="1-5" /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((v) => <SelectItem key={v} value={String(v)}>{v} / 5</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div>
              <Label>Tags</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {tags.map((tag) => (
                  <button type="button" key={tag.id} onClick={() => toggleTag(tag.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      selectedTags.includes(tag.id) ? "text-primary-foreground" : "text-foreground bg-surface"
                    }`}
                    style={selectedTags.includes(tag.id) ? { backgroundColor: tag.color, borderColor: tag.color } : undefined}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes / Thesis</Label>
            <Textarea id="notes" placeholder="Why did you take this trade? What was your plan?" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button type="submit" disabled={isPending} className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground">
              {isPending ? "Saving..." : "Save Trade"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
