import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { useHomepagePublicMovers } from "@/hooks/useHomepagePublicMovers";
import {
  marketPulseDelayDisclosure,
  marketPulseUniverseDisclosure,
  selectMarketPulseItems,
} from "@/lib/markets/market-pulse-select";
import { moversFetchErrorMessage, moversSuccessfulEmptyMessage } from "@/lib/markets/movers-provenance";
import { resolveMarketSession } from "@/lib/price-utils";
import { MARKET_HEADLINE_CANDIDATE_POOL } from "@/lib/news/market-headline-quality";
import type { MarketPulseIntelligenceRecord } from "@/lib/markets/market-pulse-contract";

function formatVolume(volume: number | null): string {
  if (volume === null || !Number.isFinite(volume)) return "—";
  return volume.toLocaleString();
}

function PulseRow({ item }: { item: MarketPulseIntelligenceRecord }) {
  const navigate = useNavigate();
  const positive = item.direction === "up";

  return (
    <article
      className="group rounded-md border border-border/80 bg-card/40 px-3 py-3 transition-colors hover:border-accent-blue/40 hover:bg-muted/20"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={() => {
                trackEvent("stock_search", { ticker: item.symbol, source: "market_pulse" });
                navigate(item.stockDetailPath);
              }}
              className="font-mono text-sm font-bold text-accent-blue hover:underline"
            >
              {item.symbol}
            </button>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {item.movementLabel}
            </span>
          </div>
          <p className="mt-1 text-sm text-foreground tabular-nums">
            <span className={cn("font-semibold", positive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
              {positive ? "+" : ""}{item.changePercent.toFixed(2)}%
            </span>
            <span className="text-muted-foreground"> · </span>
            <span>{formatVolume(item.volume)} shares traded</span>
            <span className="text-muted-foreground"> · </span>
            <span>${item.price.toFixed(2)}</span>
          </p>
          {item.observationLine ? (
            <p className="mt-1 text-[0.6875rem] leading-snug text-muted-foreground" title={item.observationLine}>
              Market observation: {item.observationLine}
            </p>
          ) : item.observationTimeUnavailable ? (
            <p className="mt-1 text-[0.6875rem] text-muted-foreground">
              Market observation: time unavailable · {marketPulseDelayDisclosure()}
            </p>
          ) : null}
          {item.relatedHeadline && (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground/80">{item.relatedHeadline.label}:</span>{" "}
              <a
                href={item.relatedHeadline.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-blue hover:underline"
              >
                {item.relatedHeadline.headline}
              </a>
              {item.relatedHeadline.source && (
                <span className="text-muted-foreground"> · {item.relatedHeadline.source}</span>
              )}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

export function MarketPulse() {
  const moversQuery = useHomepagePublicMovers();
  const marketClosed = resolveMarketSession() === "closed";

  const headlinesQuery = useQuery({
    queryKey: ["market-pulse-headlines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_news")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(MARKET_HEADLINE_CANDIDATE_POOL);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 120_000,
    retry: 2,
  });

  const model = useMemo(() => {
    if (moversQuery.isLoading) return { status: "loading" as const, items: [] };
    if (moversQuery.isError) return { status: "error" as const, items: [] };
    const bundle = moversQuery.data;
    if (!bundle) return { status: "loading" as const, items: [] };

    const items = selectMarketPulseItems({
      gainers: bundle.gainers.movers,
      losers: bundle.losers.movers,
      provenance: bundle.combinedProvenance,
      nowMs: bundle.fetchedAtMs,
      headlines: headlinesQuery.data ?? [],
    });

    if (items.length === 0) {
      return {
        status: "empty" as const,
        items: [],
        provenance: bundle.combinedProvenance,
      };
    }

    return {
      status: "ready" as const,
      items,
      provenance: bundle.combinedProvenance,
    };
  }, [moversQuery.isLoading, moversQuery.isError, moversQuery.data, headlinesQuery.data]);

  return (
    <section
      aria-labelledby="market-pulse-heading"
      className="px-4 py-4"
    >
      <div className="rounded-lg border border-border bg-gradient-to-b from-muted/30 to-background p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-1 border-b border-border/60 pb-3">
          <h2 id="market-pulse-heading" className="text-base font-bold tracking-tight text-foreground md:text-lg">
            Significant Market Moves
          </h2>
          <p className="text-[0.6875rem] uppercase tracking-wider text-muted-foreground">
            Market Pulse · {marketPulseDelayDisclosure()}
          </p>
          {model.status === "ready" || model.status === "empty" ? (
            <>
              {"provenance" in model && model.provenance && (
                <p className="text-xs text-muted-foreground">{model.provenance.sessionLine}</p>
              )}
              {"provenance" in model && model.provenance?.observationLine && (
                <p className="text-xs text-muted-foreground">{model.provenance.observationLine}</p>
              )}
              {"provenance" in model && model.provenance?.isPriorSession && (
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Historical prior-session snapshot — not a new live event.
                </p>
              )}
            </>
          ) : null}
        </div>

        {model.status === "loading" ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : model.status === "error" ? (
          <p className="text-sm text-muted-foreground">{moversFetchErrorMessage()}</p>
        ) : model.status === "empty" ? (
          <p className="text-sm text-muted-foreground">
            {moversSuccessfulEmptyMessage({ marketClosed })}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {model.items.map((item) => (
              <PulseRow key={item.eventIdentity} item={item} />
            ))}
          </div>
        )}

        <p className="mt-3 text-[0.6875rem] leading-relaxed text-muted-foreground">
          {marketPulseUniverseDisclosure()}
        </p>
      </div>
    </section>
  );
}
