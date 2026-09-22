import { Link } from "react-router-dom";
import { Brain, Calendar, BookOpen, Star, LineChart, ExternalLink } from "lucide-react";
import { touchWorkflowHandoff, workflowSymbolRoutes } from "@/lib/historical-workflow/workflow-symbol-routes";

interface Props {
  symbol: string;
  showWatchlist?: boolean;
  showChart?: boolean;
  sourceUrl?: string | null;
}

export function SymbolActions({ symbol, showWatchlist, showChart, sourceUrl }: Props) {
  const routes = workflowSymbolRoutes(symbol);
  const touch = () => touchWorkflowHandoff(symbol, "action_center");
  const cls = "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground hover:bg-accent-blue-light transition-colors";
  if (!routes) {
    return sourceUrl ? (
      <div className="flex flex-wrap gap-1.5">
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={cls} aria-label="Open source">
          <ExternalLink className="h-3 w-3" /> Source
        </a>
      </div>
    ) : null;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      <Link to={routes.ai} onClick={touch} className={cls} aria-label={`Ask AI Analyst about ${routes.symbol}`}>
        <Brain className="h-3 w-3" /> AI
      </Link>
      <Link to={routes.catalyst} onClick={touch} className={cls} aria-label={`View Catalyst for ${routes.symbol}`}>
        <Calendar className="h-3 w-3" /> Catalyst
      </Link>
      <Link to={routes.journal} onClick={touch} className={cls} aria-label={`Journal ${routes.symbol}`}>
        <BookOpen className="h-3 w-3" /> Journal
      </Link>
      {showWatchlist && (
        <Link to={routes.watchlist} onClick={touch} className={cls} aria-label={`Open Watchlist for ${routes.symbol}`}>
          <Star className="h-3 w-3" /> Watchlist
        </Link>
      )}
      {showChart && (
        <Link to={routes.chart} onClick={touch} className={cls} aria-label={`View ${routes.symbol} chart`}>
          <LineChart className="h-3 w-3" /> Chart
        </Link>
      )}
      {sourceUrl && (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={cls} aria-label="Open source">
          <ExternalLink className="h-3 w-3" /> Source
        </a>
      )}
    </div>
  );
}
