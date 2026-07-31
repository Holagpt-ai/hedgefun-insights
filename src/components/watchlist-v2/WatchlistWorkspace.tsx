import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useWatchlistV2 } from "@/hooks/useWatchlistV2";
import { fetchCatalystEventsForEnrichment } from "@/hooks/useCatalystEnrichmentForSymbols";
import { selectNearestEarnings, type EarningsBadge } from "@/lib/watchlist-v2/earnings";
import { normalizeHandoffSymbol } from "@/lib/watchlist-v2/handoff";
import {
  computeSummaryMetrics,
  currentMarketSessionLabel,
  densityTokens,
  DENSITY_STORAGE_KEY,
  parseDensity,
  rowMatchesFilter,
  sortRows,
  type WatchlistDensity,
  type WatchlistFilter,
  type WatchlistSort,
} from "@/lib/watchlist-v2/metrics";
import { WatchlistCommandHeader } from "@/components/watchlist-v2/WatchlistCommandHeader";
import { WatchlistSummaryStrip } from "@/components/watchlist-v2/WatchlistSummaryStrip";
import { WatchlistRowV2 } from "@/components/watchlist-v2/WatchlistRowV2";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Lock } from "lucide-react";

interface Props {
  className?: string;
}

function readStoredDensity(): WatchlistDensity {
  try {
    return parseDensity(localStorage.getItem(DENSITY_STORAGE_KEY));
  } catch {
    return "compact";
  }
}

function LoadingShimmer() {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Loading watchlist">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-[72px] rounded-md border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/80",
            "motion-safe:animate-pulse motion-reduce:animate-none",
          )}
        />
      ))}
    </div>
  );
}

/**
 * Route-neutral Watchlist Command Center workspace.
 * Owns data, add/remove, refresh, sort/filter, expansion handoff, and states.
 * Rendered from both `/watchlist` (public shell) and `/dashboard/watchlist`.
 */
export function WatchlistWorkspace({ className }: Props) {
  const {
    isAuthenticated,
    isLoading,
    rows,
    refresh,
    refreshingSymbol,
    addSymbol,
    removeSymbol,
    isAdding,
  } = useWatchlistV2();

  const [searchParams] = useSearchParams();
  const handoff = useMemo(
    () => normalizeHandoffSymbol(searchParams.get("symbol")),
    [searchParams],
  );

  const [filter, setFilter] = useState<WatchlistFilter>("all");
  const [sort, setSort] = useState<WatchlistSort>("added");
  const [density, setDensity] = useState<WatchlistDensity>(readStoredDensity);
  const [search, setSearch] = useState("");

  const onDensity = (d: WatchlistDensity) => {
    setDensity(d);
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, d);
    } catch {
      /* ignore quota / private mode */
    }
  };

  const symbols = useMemo(() => rows.map((r) => r.ticker), [rows]);
  const tokens = densityTokens(density);

  const earningsQuery = useQuery({
    queryKey: ["watchlist-earnings", symbols],
    enabled: isAuthenticated && symbols.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const nowMs = Date.now();
      const events = await fetchCatalystEventsForEnrichment(symbols, nowMs);
      return selectNearestEarnings(events, symbols, nowMs);
    },
  });

  const earningsBySymbol: Map<string, EarningsBadge> = earningsQuery.data ?? new Map();

  const rowRefs = useRef(new Map<string, HTMLDivElement | null>());
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const lastHandledRef = useRef<string | null>(null);

  const existingTickers = useMemo(
    () => new Set(rows.map((r) => r.ticker.toUpperCase())),
    [rows],
  );

  useEffect(() => {
    if (!handoff || isLoading) return;
    if (!existingTickers.has(handoff)) return;
    if (lastHandledRef.current === handoff) return;
    lastHandledRef.current = handoff;

    setHighlighted(handoff);
    const el = rowRefs.current.get(handoff);
    if (el && typeof el.scrollIntoView === "function") {
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    }
    const timer = setTimeout(() => setHighlighted(null), 2500);
    return () => clearTimeout(timer);
  }, [handoff, isLoading, existingTickers]);

  const prefillSymbol = handoff && !existingTickers.has(handoff) ? handoff : null;

  const sessionLabel = currentMarketSessionLabel();

  const filteredSorted = useMemo(() => {
    const q = search.trim().toUpperCase();
    let list = rows.filter((r) => rowMatchesFilter(r, filter, earningsBySymbol));
    if (q) {
      list = list.filter(
        (r) =>
          r.ticker.toUpperCase().includes(q) ||
          (r.companyName?.toUpperCase().includes(q) ?? false),
      );
    }
    return sortRows(list, sort, earningsBySymbol);
  }, [rows, filter, sort, search, earningsBySymbol]);

  const summary = useMemo(
    () => computeSummaryMetrics(rows, earningsBySymbol),
    [rows, earningsBySymbol],
  );

  if (!isAuthenticated) {
    return (
      <div className={cn("p-4 md:p-8 min-w-0 overflow-x-hidden", className)}>
        <div className="max-w-lg mx-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <Lock className="h-5 w-5 text-slate-600 dark:text-slate-300" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50 mb-2">
            Your Watchlist Command Center
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 leading-relaxed">
            Sign in or create a free account to load and save your personal Watchlist.
            Free and Pro accounts share the same Watchlist experience — no upgrade required.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              className="bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/signup">Create account</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "p-4 md:p-6 space-y-4 md:space-y-5 min-w-0 overflow-x-hidden",
        "bg-slate-50/40 dark:bg-slate-950/40",
        className,
      )}
    >
      <WatchlistCommandHeader
        symbolCount={rows.length}
        sessionLabel={sessionLabel}
        onAdd={addSymbol}
        isAdding={isAdding}
        prefillSymbol={prefillSymbol}
        search={search}
        onSearch={setSearch}
        filter={filter}
        onFilter={setFilter}
        sort={sort}
        onSort={setSort}
        density={density}
        onDensity={onDensity}
      />

      <WatchlistSummaryStrip
        metrics={summary}
        activeFilter={filter}
        onFilter={setFilter}
      />

      {isLoading ? (
        <LoadingShimmer />
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-12 text-center">
          <div className="text-base font-medium text-slate-900 dark:text-slate-50 mb-1">
            Your watchlist is empty
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400">
            Search by company name or symbol above to begin.
          </div>
        </div>
      ) : filteredSorted.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          No symbols match the current filter or search.
        </div>
      ) : (
        <div className={tokens.listGap}>
          {filteredSorted.map((row) => {
            const key = row.ticker.toUpperCase();
            const isHighlighted = highlighted === key;
            return (
              <div
                key={row.ticker}
                ref={(el) => rowRefs.current.set(key, el)}
                data-ticker={key}
                className={cn(
                  "rounded-md motion-safe:transition-shadow motion-safe:duration-150",
                  isHighlighted &&
                    "ring-2 ring-cyan-500/70 dark:ring-cyan-400/50 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-950",
                )}
              >
                <WatchlistRowV2
                  row={row}
                  onRefresh={refresh}
                  onRemove={removeSymbol}
                  isRefreshing={refreshingSymbol === row.ticker}
                  density={density}
                  earnings={earningsBySymbol.get(key) ?? null}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
