import { Link } from "react-router-dom";
import { catalystSymbolHref } from "@/lib/catalyst/enrichment";

export function ActiveSymbolRail({
  symbol,
  onDetails,
}: {
  symbol: string | null;
  onDetails: () => void;
}) {
  if (!symbol) return null;
  const encoded = encodeURIComponent(symbol);
  const catalyst = catalystSymbolHref(symbol) ?? `/dashboard/catalyst?symbol=${encoded}`;
  const linkClass = "rounded-md border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted";
  return (
    <div
      data-testid="active-symbol-rail"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Active Symbol</span>
      <span className="font-semibold tracking-wide text-accent-blue">{symbol}</span>
      <button type="button" className={linkClass} onClick={onDetails}>
        Details
      </button>
      <Link className={linkClass} to={`/dashboard/ai?symbol=${encoded}`}>
        AI Analyst
      </Link>
      <Link className={linkClass} to={catalyst}>
        Catalyst
      </Link>
      <Link className={linkClass} to={`/dashboard/watchlist?symbol=${encoded}`}>
        Watchlist
      </Link>
      <Link className={linkClass} to={`/dashboard/journal?symbol=${encoded}`}>
        Journal
      </Link>
      <Link className={linkClass} to="/dashboard/action-center">
        Action Center
      </Link>
    </div>
  );
}
