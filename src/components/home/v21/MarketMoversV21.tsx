import { useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
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
import { getEffectiveLanguage } from "@/config/locale-v1.policy";
import { useLanguage } from "@/contexts/LanguageContext";
import { homepageV21Copy, type HomepageV21Lang } from "@/lib/homepage/homepage-v21-copy";

export type MoversPriceFilter = "all" | "gt1" | "gt10";

function applyPriceFilter<T extends { price: number | null }>(rows: T[], filter: MoversPriceFilter): T[] {
  if (filter === "all") return rows;
  const min = filter === "gt1" ? 1 : 10;
  return rows.filter((r) => r.price !== null && r.price > min);
}

export function MarketMoversV21() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { language } = useLanguage();
  const lang = getEffectiveLanguage(language, pathname) as HomepageV21Lang;
  const copy = homepageV21Copy(lang);
  const session = resolveMarketSession();
  const moversQuery = useHomepagePublicMovers();
  const [tab, setTab] = useState<HomepageMoversTab>("gainers");
  const [priceFilter, setPriceFilter] = useState<MoversPriceFilter>("gt1");

  const activeQuery = useQuery({
    queryKey: ["homepage-movers-active", session],
    queryFn: () => fetchPublicMostActiveRows(session),
    enabled: tab === "active",
    staleTime: 60_000,
  });

  const rawRows = useMemo(() => {
    if (tab === "gainers") return moversQuery.data?.gainers.rows ?? [];
    if (tab === "losers") return moversQuery.data?.losers.rows ?? [];
    return activeQuery.data?.rows ?? [];
  }, [tab, moversQuery.data, activeQuery.data]);

  const visible = useMemo(
    () => applyPriceFilter(rawRows, priceFilter).slice(0, 10),
    [rawRows, priceFilter],
  );

  const isLoading = tab === "active" ? activeQuery.isLoading : moversQuery.isLoading;
  const isError = tab === "active" ? activeQuery.isError : moversQuery.isError;
  const isClosedSession = session === "closed";
  const provenance =
    tab === "active" ? activeQuery.data?.provenance : moversQuery.data?.combinedProvenance;

  const filterLabel =
    priceFilter === "all"
      ? copy.moversPriceFilterAll
      : priceFilter === "gt1"
        ? copy.moversPriceFilterGt1
        : copy.moversPriceFilterGt10;

  return (
    <section
      id="moversCard"
      aria-labelledby="hp-movers-heading"
      className={cn(
        "band-movers hp-card flex min-h-0 flex-col overflow-hidden",
        !isClosedSession && "flex-1",
      )}
    >
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
        <h2 id="hp-movers-heading" className="text-base font-extrabold">
          {copy.moversTitle}
        </h2>
        <span className="text-xs text-[var(--hp-ink-3)]">{clockSessionToMoverSession(session)}</span>
        <label className="ml-auto flex items-center gap-1 text-xs text-[var(--hp-ink-3)]">
          <span className="sr-only">Price filter</span>
          <select
            className="mini-select rounded-lg border border-[var(--hp-line)] bg-[var(--hp-surface)] px-2 py-1 text-xs font-semibold text-[var(--hp-ink-2)]"
            value={priceFilter}
            onChange={(e) => setPriceFilter(e.target.value as MoversPriceFilter)}
            aria-label="Price filter"
          >
            <option value="gt1">{copy.moversPriceFilterGt1}</option>
            <option value="all">{copy.moversPriceFilterAll}</option>
            <option value="gt10">{copy.moversPriceFilterGt10}</option>
          </select>
        </label>
        <div className="flex w-full gap-1 rounded-lg border border-[var(--hp-line)] p-0.5 sm:ml-0 sm:w-auto">
          {HOMEPAGE_V21_MOVERS_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-bold",
                tab === t.id ? "bg-white shadow-sm text-[var(--hp-blue)] dark:bg-card" : "text-[var(--hp-ink-2)]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 pb-2 text-[10px] leading-snug text-[var(--hp-ink-3)]">
        <p>{PUBLIC_MARKET_DATA_DELAY_DISCLOSURE}</p>
        {provenance?.observationLine ? <p>{provenance.observationLine}</p> : null}
        {provenance?.sessionLine ? <p>{provenance.sessionLine}</p> : null}
        <p className="text-[var(--hp-ink-3)]">{filterLabel}</p>
      </div>
      <div className={cn("card-body overflow-x-auto", !isClosedSession && "min-h-0 flex-1")}>
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
          <table className="mt-table w-full min-w-[280px] text-sm">
            <thead>
              <tr className="border-b border-[var(--hp-line)] text-left text-[11px] uppercase tracking-wide text-[var(--hp-ink-3)]">
                <th className="px-4 py-2">Symbol</th>
                <th className="hidden px-2 py-2 sm:table-cell">Name</th>
                <th className="px-2 py-2 text-right">Price</th>
                <th className="px-2 py-2 text-right">Change</th>
                <th className="px-2 py-2 text-right md:table-cell">Vol</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr key={row.symbol} className="border-b border-[var(--hp-line)] hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <Link
                      to={publicStockDetailPath(row.symbol)}
                      className="sym hp-num font-mono font-bold text-[var(--hp-blue)] hover:underline"
                    >
                      {row.symbol}
                    </Link>
                  </td>
                  <td className="hidden max-w-[120px] truncate px-2 py-2 sm:table-cell">{row.name ?? "—"}</td>
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
                  <td className="hp-num px-2 py-2 text-right md:table-cell">
                    {row.volume ? row.volume.toLocaleString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <button
        type="button"
        onClick={() =>
          navigate(HOMEPAGE_V21_MOVERS_TABS.find((t) => t.id === tab)?.href ?? "/markets/gainers")
        }
        className="w-full shrink-0 border-t border-[var(--hp-line)] py-2 text-xs font-bold text-[var(--hp-blue)]"
      >
        {copy.moversViewAll}
      </button>
    </section>
  );
}