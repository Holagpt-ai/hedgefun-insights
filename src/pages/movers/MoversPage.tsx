import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { usePageSeo } from "@/hooks/usePageSeo";
import { BRAND } from "@/config/brand";
import { etSessionDate } from "@/lib/markets/movers-integrity";
import { fetchLegacyMoversRoute } from "@/lib/markets/movers-page-fetch";
import {
  delayedMarketMoversSeoDescription,
  moversFetchErrorMessage,
  moversSuccessfulEmptyMessage,
  MOST_ACTIVE_TRACKED_UNIVERSE_DETAIL,
  MOST_ACTIVE_TRACKED_UNIVERSE_TITLE,
} from "@/lib/markets/movers-provenance";
import { resolveMarketSession } from "@/lib/price-utils";
import { publicStockDetailPath } from "@/lib/public/public-workflow-links";
import { trackPublicDiscoveryNav } from "@/lib/analytics/public-events";
import {
  MOVERS_PAGE_SHELL_CLASS,
  MOVERS_TABLE_CLASS,
  MOVERS_TABLE_SCROLLER_CLASS,
} from "@/components/markets/movers-responsive";

const TYPE_MAP: Record<string, { title: string }> = {
  gainers: { title: "Top Gainers" },
  losers: { title: "Top Losers" },
  active: { title: MOST_ACTIVE_TRACKED_UNIVERSE_TITLE },
  premarket: { title: "Pre-Market Movers" },
  afterhours: { title: "After-Hours Movers" },
};

const TYPES = ["gainers", "losers", "active", "premarket", "afterhours"];

const MoversPage = () => {
  const { type = "gainers" } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const config = TYPE_MAP[type] ?? TYPE_MAP.gainers;
  const clockSession = resolveMarketSession();
  const sessionDate = etSessionDate();
  const marketClosed = clockSession === "closed";

  const { data, isLoading, isError, isSuccess } = useQuery({
    queryKey: ["movers", type, clockSession, sessionDate],
    queryFn: () => fetchLegacyMoversRoute(type, clockSession),
    staleTime: 60_000,
    retry: 3,
    retryDelay: 2000,
  });

  usePageSeo({
    title: `${config.title} | ${BRAND.name}`,
    description: delayedMarketMoversSeoDescription("stock market movers", BRAND.name),
  });

  const rows = data?.rows ?? [];
  const provenance = data?.provenance;

  return (
    <div className={cn(MOVERS_PAGE_SHELL_CLASS, "p-4")}>
      <h1 className="text-lg font-bold text-foreground mb-3">{config.title}</h1>

      {provenance && (
        <div className="mb-3 space-y-0.5 text-xs text-muted-foreground">
          <p>{provenance.sessionLine}</p>
          {provenance.observationLine ? (
            <p>{provenance.observationLine}</p>
          ) : provenance.observationTimeUnavailable ? (
            <p>Provider observation time unavailable</p>
          ) : null}
          {provenance.universeDetail && <p>{provenance.universeDetail}</p>}
        </div>
      )}

      <div className="flex gap-1 mb-4 flex-wrap">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => navigate(`/movers/${t}`)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full transition-colors capitalize",
              t === type ? "bg-accent-blue text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {TYPE_MAP[t].title}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {isError
            ? moversFetchErrorMessage()
            : isSuccess
              ? moversSuccessfulEmptyMessage({ marketClosed, premarket: type === "premarket" })
              : moversSuccessfulEmptyMessage({ marketClosed, premarket: type === "premarket" })}
        </p>
      ) : (
        <div className={cn("fintech-card", MOVERS_TABLE_SCROLLER_CLASS)} role="region" aria-label={`${config.title} table`}>
          <table className={MOVERS_TABLE_CLASS}>
            <thead>
              <tr className="border-b border-border">
                <th className="table-header whitespace-nowrap text-left px-2 py-2 md:px-3">Symbol</th>
                <th className="table-header text-right px-2 py-2 md:px-3">Price</th>
                <th className="table-header text-right px-2 py-2 md:px-3">Change %</th>
                <th className="table-header text-right px-2 py-2 md:px-3">Volume</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((m) => (
                <tr key={m.symbol} className="border-b border-border last:border-b-0 hover:bg-accent/50">
                  <td className="whitespace-nowrap px-2 py-2 md:px-3">
                    <button
                      onClick={() => {
                        trackEvent("stock_search", { ticker: m.symbol });
                        trackPublicDiscoveryNav({ from: "public_movers", to: "stock_detail", symbol: m.symbol });
                        navigate(publicStockDetailPath(m.symbol));
                      }}
                      className="ticker-symbol text-accent-blue hover:underline text-sm"
                    >
                      {m.symbol}
                    </button>
                  </td>
                  <td
                    className="px-2 py-2 text-right tabular-nums md:px-3"
                    title={m.priceObservationLine ?? undefined}
                  >
                    ${m.price.toFixed(2)}
                  </td>
                  <td className={cn("px-2 py-2 text-right tabular-nums font-medium md:px-3", m.changePercent >= 0 ? "price-positive" : "price-negative")}>
                    {m.changePercent >= 0 ? "↑" : "↓"} {Math.abs(m.changePercent).toFixed(2)}%
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums md:px-3">
                    {m.volume !== null && Number.isFinite(m.volume) ? m.volume.toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {type === "active" && (
        <p className="mt-3 text-xs text-muted-foreground">{MOST_ACTIVE_TRACKED_UNIVERSE_DETAIL}</p>
      )}
    </div>
  );
};

export default MoversPage;
