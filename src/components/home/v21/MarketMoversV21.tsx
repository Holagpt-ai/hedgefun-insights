import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useHomepagePublicMovers } from "@/hooks/useHomepagePublicMovers";
import {
  fetchPublicMostActiveRows,
  clockSessionToMoverSession,
} from "@/lib/markets/movers-page-fetch";
import { resolveMarketSession } from "@/lib/price-utils";
import {
  HOMEPAGE_V21_MOVERS_TABS,
  type HomepageMoversTab,
} from "@/config/homepage-v21";
import { publicStockDetailPath } from "@/lib/public/public-workflow-links";
import { moversFetchErrorMessage, moversSuccessfulEmptyMessage } from "@/lib/markets/movers-provenance";
import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";

export function MarketMoversV21() {
  const navigate = useNavigate();
  const session = resolveMarketSession();
  const moversQuery = useHomepagePublicMovers();
  const [tab, setTab] = useState<HomepageMoversTab>("gainers");

  const activeQuery = useQuery({
    queryKey: ["homepage-movers-active", session],
    queryFn: () => fetchPublicMostActiveRows(session),
    enabled: tab === "active",
    staleTime: 60_000,
  });

  const rows = useMemo(() => {
    if (tab === "gainers") return moversQuery.data?.gainers.rows ?? [];
    if (tab === "losers") return moversQuery.data?.losers.rows ?? [];
    return activeQuery.data?.rows ?? [];
  }, [tab, moversQuery.data, activeQuery.data]);

  const isLoading = tab === "active" ? activeQuery.isLoading : moversQuery.isLoading;
  const isError = tab === "active" ? activeQuery.isError : moversQuery.isError;
  const visible = rows.slice(0, 10);

  return (
    <section aria-labelledby="hp-movers-heading" className="hp-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
        <h2 id="hp-movers-heading" className="text-base font-extrabold">
          Market Movers
        </h2>
        <span className="text-xs text-[var(--hp-ink-3)]">{clockSessionToMoverSession(session)}</span>
        <div className="ml-auto flex gap-1 rounded-lg border border-[var(--hp-line)] p-0.5">
          {HOMEPAGE_V21_MOVERS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-bold",
                tab === t.id ? "bg-white shadow-sm text-[var(--hp-blue)]" : "text-[var(--hp-ink-2)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <p className="px-4 pb-2 text-[10px] text-[var(--hp-ink-3)]">{PUBLIC_MARKET_DATA_DELAY_DISCLOSURE}</p>
      {isLoading ? (
        <div className="space-y-1 p-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="p-4 text-sm">{moversFetchErrorMessage()}</p>
      ) : visible.length === 0 ? (
        <p className="p-4 text-sm">{moversSuccessfulEmptyMessage({ marketClosed: session === "closed" })}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-table w-full min-w-[320px] text-sm">
            <thead>
              <tr className="border-b border-[var(--hp-line)] text-left text-[11px] uppercase tracking-wide text-[var(--hp-ink-3)]">
                <th className="px-4 py-2">Symbol</th>
                <th className="hidden px-2 py-2 sm:table-cell">Name</th>
                <th className="px-2 py-2 text-right">Price</th>
                <th className="px-2 py-2 text-right">Change</th>
                <th className="hidden px-4 py-2 text-right md:table-cell">Volume</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={row.symbol}
                  className="cursor-pointer border-b border-[var(--hp-line)] hover:bg-muted/20"
                  onClick={() => navigate(publicStockDetailPath(row.symbol))}
                >
                  <td className="sym px-4 py-2 font-mono font-bold text-[var(--hp-blue)]">{row.symbol}</td>
                  <td className="hidden max-w-[140px] truncate px-2 py-2 sm:table-cell">{row.name ?? "—"}</td>
                  <td className="hp-num px-2 py-2 text-right font-semibold">
                    {row.price !== null ? `$${row.price.toFixed(2)}` : "—"}
                  </td>
                  <td
                    className={cn(
                      "hp-num px-2 py-2 text-right font-bold",
                      (row.changePercent ?? 0) >= 0 ? "text-[var(--hp-up)]" : "text-[var(--hp-down)]",
                    )}
                  >
                    {row.changePercent !== null
                      ? `${row.changePercent >= 0 ? "+" : ""}${row.changePercent.toFixed(2)}%`
                      : "—"}
                  </td>
                  <td className="hp-num hidden px-4 py-2 text-right md:table-cell">
                    {row.volume ? row.volume.toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        onClick={() =>
          navigate(HOMEPAGE_V21_MOVERS_TABS.find((t) => t.id === tab)?.href ?? "/markets/gainers")
        }
        className="w-full border-t border-[var(--hp-line)] py-2 text-xs font-bold text-[var(--hp-blue)]"
      >
        View all movers →
      </button>
    </section>
  );
}