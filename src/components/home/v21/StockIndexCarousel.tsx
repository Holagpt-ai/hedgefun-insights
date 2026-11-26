import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { indexDisplayLabel } from "@/lib/market-indexes/display-labels";
import {
  HOMEPAGE_V21_INDEX_PAGE_SIZE,
  HOMEPAGE_V21_INDEX_SYMBOLS,
} from "@/config/homepage-v21";
import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";
import { AreaChart, Area, ResponsiveContainer, YAxis, ReferenceLine } from "recharts";
import { cn } from "@/lib/utils";

export function StockIndexCarousel() {
  const [page, setPage] = useState(0);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["homepage-v21-indexes", ...HOMEPAGE_V21_INDEX_SYMBOLS],
    queryFn: async () => {
      const { data: rows, error } = await supabase
        .from("market_indexes")
        .select("*")
        .in("symbol", [...HOMEPAGE_V21_INDEX_SYMBOLS]);
      if (error) throw error;
      return rows ?? [];
    },
    staleTime: 60_000,
  });

  const ordered = useMemo(() => {
    const by = new Map((data ?? []).map((r) => [r.symbol, r]));
    return HOMEPAGE_V21_INDEX_SYMBOLS.map((s) => by.get(s)).filter(Boolean);
  }, [data]);

  const pageCount = Math.max(1, Math.ceil(ordered.length / HOMEPAGE_V21_INDEX_PAGE_SIZE));
  const slice = ordered.slice(
    page * HOMEPAGE_V21_INDEX_PAGE_SIZE,
    page * HOMEPAGE_V21_INDEX_PAGE_SIZE + HOMEPAGE_V21_INDEX_PAGE_SIZE,
  );

  const latestUpdated = ordered.reduce<string | null>((acc, row) => {
    if (!row?.updated_at) return acc;
    if (!acc || row.updated_at > acc) return row.updated_at;
    return acc;
  }, null);

  return (
    <section aria-labelledby="homepage-index-heading" className="hp-card overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 pb-0">
        <h2 id="homepage-index-heading" className="text-base font-extrabold tracking-tight">
          Stock Indexes
        </h2>
        <span className="text-xs text-[var(--hp-ink-3)]">
          {HOMEPAGE_V21_INDEX_SYMBOLS.length} indexes · {HOMEPAGE_V21_INDEX_PAGE_SIZE} at a time
        </span>
        <span className="ml-auto text-xs font-semibold text-[var(--hp-ink-3)]" aria-live="polite">
          {page + 1} / {pageCount}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Previous index page"
            disabled={page <= 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="grid h-8 w-8 place-items-center rounded-full border border-[var(--hp-line)] disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next index page"
            disabled={page >= pageCount - 1}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            className="grid h-8 w-8 place-items-center rounded-full border border-[var(--hp-line)] disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : isError || ordered.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--hp-ink-2)]">Index data is unavailable right now.</p>
      ) : (
        <div
          className="grid grid-cols-1 gap-0 border-t border-[var(--hp-line)] sm:grid-cols-2 lg:grid-cols-5"
          onTouchStart={(e) => {
            const touch = e.changedTouches[0];
            (e.currentTarget as HTMLElement).dataset.touchX = String(touch.clientX);
          }}
          onTouchEnd={(e) => {
            const start = Number((e.currentTarget as HTMLElement).dataset.touchX);
            const end = e.changedTouches[0].clientX;
            const delta = end - start;
            if (Math.abs(delta) < 40) return;
            if (delta < 0 && page < pageCount - 1) setPage((p) => p + 1);
            if (delta > 0 && page > 0) setPage((p) => p - 1);
          }}
        >
          {slice.map((idx) => {
            if (!idx) return null;
            const rawSparkline = Array.isArray(idx.sparkline_data) ? (idx.sparkline_data as number[]) : [];
            const sparkData = rawSparkline.map((v, i) => ({ v, i }));
            const lastSpark = rawSparkline.length > 0 ? rawSparkline[rawSparkline.length - 1] : 0;
            const prevClose = rawSparkline.length >= 2 ? rawSparkline[rawSparkline.length - 2] : rawSparkline[0] ?? 0;
            const rawPct = idx.change_percent ?? 0;
            const computedPct =
              prevClose > 0 && lastSpark > 0 ? ((lastSpark - prevClose) / prevClose) * 100 : 0;
            const changePct = rawPct !== 0 ? rawPct : computedPct;
            const positive = changePct >= 0;
            const color = positive ? "var(--hp-up)" : "var(--hp-down)";
            const displayName = indexDisplayLabel(idx.symbol, idx.name);
            return (
              <Link
                key={idx.symbol}
                to={`/etf/${idx.symbol.toLowerCase()}`}
                className="flex min-h-[72px] items-center gap-3 border-b border-[var(--hp-line)] px-4 py-3 last:border-b-0 sm:border-r sm:last:border-r-0 hover:bg-muted/20"
              >
                <div className="min-w-0 flex-1">
                  <div className="hp-index-name font-bold text-[var(--hp-blue)]">{displayName}</div>
                  <div className="hp-num text-sm font-semibold text-[var(--hp-ink)]">
                    {(idx.current_value ?? lastSpark).toFixed(2)}
                  </div>
                  <div
                    className={cn(
                      "hp-num text-xs font-bold",
                      positive ? "text-[var(--hp-up)]" : "text-[var(--hp-down)]",
                    )}
                  >
                    {positive ? "+" : ""}
                    {changePct.toFixed(2)}%
                  </div>
                </div>
                <div className="hidden h-10 w-20 shrink-0 sm:block">
                  {sparkData.length > 1 && (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={sparkData}>
                        <YAxis domain={["auto", "auto"]} hide />
                        <ReferenceLine y={prevClose} stroke="#a1a1aa" strokeDasharray="3 3" strokeWidth={1} />
                        <Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.12} strokeWidth={1.5} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
      <p className="border-t border-[var(--hp-line)] px-4 py-2 text-[11px] text-[var(--hp-ink-3)]">
        ETF proxy prices · {PUBLIC_MARKET_DATA_DELAY_DISCLOSURE}
        {latestUpdated ? ` · Updated ${new Date(latestUpdated).toLocaleString()}` : null}
      </p>
    </section>
  );
}