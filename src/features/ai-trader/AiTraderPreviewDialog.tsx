import { Link } from "react-router-dom";
import { AI_TRADER_DASHBOARD_PATH, aiTraderModeLabel } from "@/lib/ai-trader/operating-mode";
import type { AiTraderShellSnapshot } from "@/lib/ai-trader/public-snapshot";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-b-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export function AiTraderPreviewDialog({
  open,
  onOpenChange,
  snapshot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: AiTraderShellSnapshot;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>AI Trader</DialogTitle>
          <DialogDescription>{snapshot.statusCopy}</DialogDescription>
        </DialogHeader>

        <div>
          <Row label="Operating mode" value={aiTraderModeLabel(snapshot.operatingMode)} />
          <Row label="Watchlist" value="—" />
          <Row label="Positions" value="—" />
          <Row label="Activity" value="—" />
          <Row label="P&L" value="—" />
          <Row label="Completed trades" value="—" />
        </div>

        <Button asChild>
          <Link to={AI_TRADER_DASHBOARD_PATH}>Open AI Trader</Link>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
