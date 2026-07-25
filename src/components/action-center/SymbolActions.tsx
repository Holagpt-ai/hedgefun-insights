import { Link } from "react-router-dom";
import { Brain, Calendar, BookOpen, Star, LineChart, ExternalLink } from "lucide-react";

interface Props {
  symbol: string;
  showWatchlist?: boolean;
  showChart?: boolean;
  sourceUrl?: string | null;
}

export function SymbolActions({ symbol, showWatchlist, showChart, sourceUrl }: Props) {
  const sym = symbol.toUpperCase();
  const cls = "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-muted text-muted-foreground hover:text-foreground hover:bg-accent-blue-light transition-colors";
  return (
    <div className="flex flex-wrap gap-1.5">
      <Link to={`/dashboard/ai?symbol=${sym}`} className={cls} aria-label={`Ask AI Analyst about ${sym}`}>
        <Brain className="h-3 w-3" /> AI
      </Link>
      <Link to={`/dashboard/catalyst?symbol=${sym}`} className={cls} aria-label={`View Catalyst for ${sym}`}>
        <Calendar className="h-3 w-3" /> Catalyst
      </Link>
      <Link to={`/dashboard/journal?symbol=${sym}`} className={cls} aria-label={`Journal ${sym}`}>
        <BookOpen className="h-3 w-3" /> Journal
      </Link>
      {showWatchlist && (
        <Link to="/dashboard/watchlist" className={cls} aria-label="Open Watchlist">
          <Star className="h-3 w-3" /> Watchlist
        </Link>
      )}
      {showChart && (
        <Link to={`/stocks/${sym}`} className={cls} aria-label={`View ${sym} chart`}>
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
