import { Link } from "react-router-dom";
import { momentumWorkflowRoutes } from "@/lib/catalyst/momentum-workflow-routes";

export function ActiveSymbolRail({
  symbol,
  onDetails,
}: {
  symbol: string | null;
  onDetails: () => void;
}) {
  const linkClass = "rounded-md border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted";
  const workflowRoutes = symbol ? momentumWorkflowRoutes(symbol) : null;
  return (
    <div
      data-testid="active-symbol-rail"
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2"
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Active Symbol</span>
      {symbol ? (
        <>
          <span className="font-semibold tracking-wide text-accent-blue">{symbol}</span>
          <button type="button" className={linkClass} onClick={onDetails}>
            Details
          </button>
          <Link className={linkClass} to={`/dashboard/ai?symbol=${encodeURIComponent(symbol)}`}>
            AI Analyst
          </Link>
          <Link className={linkClass} to={workflowRoutes.catalyst}>
            Catalyst
          </Link>
          <Link className={linkClass} to={workflowRoutes.screeners}>
            Screeners
          </Link>
          <Link className={linkClass} to={workflowRoutes.watchlist}>
            Watchlist
          </Link>
          <Link className={linkClass} to={workflowRoutes.journal}>
            Journal
          </Link>
          <Link className={linkClass} to={workflowRoutes.ai}>
            AI Analyst
          </Link>
          <Link
            className={linkClass}
            to={
              workflowRoutes?.actionCenter ??
              `/dashboard/action-center?symbol=${encodeURIComponent(symbol)}`
            }
          >
            Action Center
          </Link>
        </>
      ) : (
        <span className="text-[12px] text-muted-foreground">Select a ticker</span>
      )}
    </div>
  );
}
