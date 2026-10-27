import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { trackAuthHandoff, trackPublicDashboardCta } from "@/lib/analytics/public-events";
import { publicHistoricalRadarHref } from "@/lib/public/public-workflow-links";

export function StockHistoricalRadarLink({ ticker }: { ticker: string }) {
  const { user } = useAuth();
  const href = publicHistoricalRadarHref(ticker, !!user);
  if (!href) return null;
  const authenticated = !!user;
  return (
    <div className="rounded-lg border bg-card/50 px-3 py-2 text-[11px]">
      <span className="text-muted-foreground">Historical episodes: </span>
      <Link
        to={href}
        className="font-medium text-accent-blue hover:underline"
        onClick={() => {
          if (!authenticated) {
            trackAuthHandoff({
              mode: "login",
              returnPath: href,
              source: "stock_detail_historical_radar",
            });
          } else {
            trackPublicDashboardCta({
              symbol: ticker,
              destination: "screeners",
              authenticated: true,
            });
          }
        }}
      >
        {authenticated ? "Open in Day Trade Radar" : "Sign in · historical Radar"}
      </Link>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Compare prior momentum sessions using stored Stocksist evidence (not live replay or predictions).
      </p>
    </div>
  );
}
