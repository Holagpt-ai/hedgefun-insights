import { Link } from "react-router-dom";
import { Brain, BookOpen, Calendar, LineChart, Star } from "lucide-react";
import {
  buildInboxWorkflowNavigatePath,
  touchWorkflowHandoff,
  workflowSymbolRoutes,
} from "@/lib/historical-workflow/workflow-symbol-routes";

interface Props {
  symbol: string;
}

export function ScannerAlertActions({ symbol }: Props) {
  const routes = workflowSymbolRoutes(symbol);
  const touch = () => touchWorkflowHandoff(symbol, "action_center");
  const cls =
    "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground hover:bg-accent-blue-light transition-colors";
  if (!routes) return null;

  const scannerHref = buildInboxWorkflowNavigatePath("screeners", symbol) ??
    "/dashboard/screeners";

  return (
    <div className="flex flex-wrap gap-1.5">
      <Link to={scannerHref} onClick={touch} className={cls} aria-label="View in Scanner">
        <LineChart className="h-3 w-3" /> Scanner
      </Link>
      <Link
        to={`${scannerHref}${scannerHref.includes("?") ? "&" : "?"}focus=history`}
        onClick={touch}
        className={cls}
        aria-label="Historical context"
      >
        <BookOpen className="h-3 w-3" /> History
      </Link>
      <Link to={routes.catalyst} onClick={touch} className={cls} aria-label="Catalyst">
        <Calendar className="h-3 w-3" /> Catalyst
      </Link>
      <Link to={routes.ai} onClick={touch} className={cls} aria-label="Ask AI">
        <Brain className="h-3 w-3" /> Ask AI
      </Link>
      <Link to={routes.watchlist} onClick={touch} className={cls} aria-label="Watchlist">
        <Star className="h-3 w-3" /> Watchlist
      </Link>
      <Link to={routes.journal} onClick={touch} className={cls} aria-label="Journal">
        <BookOpen className="h-3 w-3" /> Journal
      </Link>
    </div>
  );
}
