import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { usePublicStockCatalystSummary } from "@/hooks/usePublicStockCatalystSummary";
import { trackPublicDashboardCta } from "@/lib/analytics/public-events";
import { publicWorkflowHref } from "@/lib/public/public-workflow-links";
import { marketPulseDelayDisclosure } from "@/lib/markets/market-pulse-select";

type Props = {
  ticker: string;
  observationMs: number | null;
  observationLabel?: string | null;
};

export function StockPublicIntelligence({ ticker, observationMs, observationLabel }: Props) {
  const { user } = useAuth();
  const catalyst = usePublicStockCatalystSummary(ticker, observationMs);
  const authenticated = !!user;

  const links = [
    { label: "Screeners", target: "screeners" as const },
    { label: "Catalyst workspace", target: "catalyst" as const },
    { label: "Watchlist", target: "watchlist" as const },
    { label: "Action Center", target: "action_center" as const },
  ];

  return (
    <section className="rounded-lg border bg-card p-4 space-y-3" aria-labelledby="stock-intel-heading">
      <div>
        <h2 id="stock-intel-heading" className="text-sm font-semibold">
          Stocksist intelligence
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Provider-backed context · {marketPulseDelayDisclosure()}
          {observationLabel ? ` · ${observationLabel}` : null}
        </p>
      </div>

      {catalyst.status === "pending" && <Skeleton className="h-16 w-full rounded-md" />}
      {catalyst.status === "unavailable" && (
        <p className="text-xs text-muted-foreground">Verified catalyst lookup is unavailable right now.</p>
      )}
      {catalyst.status === "none" && (
        <p className="text-xs text-muted-foreground">
          No verified catalyst event is linked from Stocksist records for this symbol.
        </p>
      )}
      {catalyst.status === "verified" && (
        <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 space-y-1">
          <p className="text-sm font-medium">{catalyst.catalyst.title}</p>
          <p className="text-xs text-muted-foreground">
            {catalyst.catalyst.sourceName}
            {catalyst.catalyst.eventTimingLine ? ` · ${catalyst.catalyst.eventTimingLine}` : null}
          </p>
          <p className="text-[0.6875rem] leading-snug text-muted-foreground">{catalyst.disclaimer}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs pt-1">
            {catalyst.catalyst.sourceUrl && (
              <a
                href={catalyst.catalyst.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-blue hover:underline"
              >
                Source article
              </a>
            )}
            <Link
              to={publicWorkflowHref(ticker, "catalyst", authenticated) ?? "#"}
              className="text-accent-blue hover:underline"
              onClick={() => trackPublicDashboardCta({
                symbol: ticker,
                destination: "catalyst",
                authenticated,
              })}
            >
              {authenticated ? "Open Catalyst" : "Sign in for Catalyst"}
            </Link>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {links.map((link) => {
          const href = publicWorkflowHref(ticker, link.target, authenticated);
          if (!href) return null;
          const requiresAuth = !authenticated && link.target !== "screeners";
          return (
            <Link
              key={link.target}
              to={href}
              className="inline-flex items-center rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-accent-blue hover:bg-muted/40"
              onClick={() => trackPublicDashboardCta({
                symbol: ticker,
                destination: link.target,
                authenticated,
              })}
            >
              {requiresAuth ? `Sign in · ${link.label}` : link.label}
            </Link>
          );
        })}
      </div>
      {!authenticated && (
        <p className="text-[0.6875rem] text-muted-foreground">
          Free account required for watchlist and workspace tools. Screeners include public discovery views.
        </p>
      )}
    </section>
  );
}
