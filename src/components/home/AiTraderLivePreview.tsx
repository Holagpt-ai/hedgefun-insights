import { useState } from "react";
import { Bot } from "lucide-react";
import { aiTraderModeLabel } from "@/lib/ai-trader/operating-mode";
import { AI_TRADER_SHELL_SNAPSHOT } from "@/lib/ai-trader/public-snapshot";
import { AiTraderPreviewDialog } from "@/features/ai-trader/AiTraderPreviewDialog";
import { Button } from "@/components/ui/button";

export function AiTraderLivePreview() {
  const [open, setOpen] = useState(false);
  const snapshot = AI_TRADER_SHELL_SNAPSHOT;

  return (
    <section className="px-4 mt-2 mb-4" aria-label="AI Trader">
      <div className="fintech-card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Bot className="h-4 w-4 text-accent-blue" />
            <h2 className="text-base font-semibold text-foreground">AI Trader</h2>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {aiTraderModeLabel(snapshot.operatingMode)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{snapshot.statusCopy}</p>
        </div>
        <Button type="button" onClick={() => setOpen(true)} className="w-fit shrink-0 self-start md:self-center">
          Watch AI Trader
        </Button>
      </div>
      <AiTraderPreviewDialog open={open} onOpenChange={setOpen} snapshot={snapshot} />
    </section>
  );
}
