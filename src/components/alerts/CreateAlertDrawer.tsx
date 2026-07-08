import { useEffect, useState } from "react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  PRICE_ALERT_CONDITIONS, COMING_LATER_CONDITIONS, conditionUnit,
  type PriceAlert, type PriceAlertCondition,
} from "@/config/price-alerts.config";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: PriceAlert | null;
  onSave: (data: Omit<PriceAlert, "id" | "createdAt" | "updatedAt">, id?: string) => void;
}

export default function CreateAlertDrawer({ open, onOpenChange, editing, onSave }: Props) {
  const [symbol, setSymbol] = useState("");
  const [condition, setCondition] = useState<PriceAlertCondition>("price_above");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (editing) {
        setSymbol(editing.symbol);
        setCondition(editing.condition);
        setValue(String(editing.value));
        setNote(editing.note ?? "");
        setEnabled(editing.enabled);
      } else {
        setSymbol("");
        setCondition("price_above");
        setValue("");
        setNote("");
        setEnabled(true);
      }
      setError(null);
    }
  }, [open, editing]);

  const handleSave = () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym) return setError("Symbol is required.");
    if (!condition) return setError("Condition is required.");
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return setError("Value must be a positive number.");

    onSave(
      { symbol: sym, condition, value: num, note: note.trim() || undefined, enabled },
      editing?.id,
    );
    onOpenChange(false);
  };

  const unit = conditionUnit(condition);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{editing ? "Edit price alert" : "Create price alert"}</SheetTitle>
          <SheetDescription>
            Preview only. Alerts are saved locally in this browser and not delivered yet.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 py-6">
          <div className="space-y-1.5">
            <Label htmlFor="alert-symbol">Symbol</Label>
            <Input
              id="alert-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. AAPL"
              maxLength={12}
              autoCapitalize="characters"
              autoComplete="off"
              className="uppercase"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="alert-condition">Condition</Label>
            <Select value={condition} onValueChange={(v) => setCondition(v as PriceAlertCondition)}>
              <SelectTrigger id="alert-condition">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRICE_ALERT_CONDITIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
                {COMING_LATER_CONDITIONS.map((c) => (
                  <div key={c.label} className="px-2 py-1.5 text-xs text-muted-foreground flex items-center justify-between opacity-60">
                    <span>{c.label}</span>
                    <span className="text-[10px] uppercase tracking-wider">{c.note}</span>
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="alert-value">Value ({unit})</Label>
            <Input
              id="alert-value"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={unit === "$" ? "e.g. 180.50" : "e.g. 5"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="alert-note">Note (optional)</Label>
            <Textarea
              id="alert-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why are you watching this?"
              rows={3}
              maxLength={280}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
            <div>
              <div className="text-sm font-medium text-foreground">Enabled</div>
              <div className="text-xs text-muted-foreground">Disable to keep the alert but stop it from being active.</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <SheetFooter className="flex-row gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-accent-blue hover:bg-accent-blue-hover text-primary-foreground"
            onClick={handleSave}
          >
            {editing ? "Save changes" : "Create alert"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
