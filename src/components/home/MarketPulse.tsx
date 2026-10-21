import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";
import { useAuth } from "@/contexts/AuthContext";
import { trackPublicDashboardCta, trackPublicDiscoveryNav } from "@/lib/analytics/public-events";
import { publicWorkflowHref } from "@/lib/public/public-workflow-links";
import { useHomepagePublicMovers } from "@/hooks/useHomepagePublicMovers";
import { useMarketPulseCatalystEnrichment } from "@/hooks/useMarketPulseCatalystEnrichment";
import {
  attachMarketPulseCatalystContext,
  MARKET_PULSE_CAUSATION_DISCLAIMER,
  MARKET_PULSE_UNEXPLAINED_COPY,
} from "@/lib/markets/market-pulse-catalyst";
import {
  marketPulseDelayDisclosure,
  marketPulseUniverseDisclosure,
  selectMarketPulseItems,
} from "@/lib/markets/market-pulse-select";
import { moversFetchErrorMessage, moversSuccessfulEmptyMessage } from "@/lib/markets/movers-provenance";
import { resolveMarketSession } from "@/lib/price-utils";
import type { MarketPulseIntelligenceRecord } from "@/lib/markets/market-pulse-contract";

function formatVolume(volume: number | null): string {
  if (volume === null || !Number.isFinite(volume) || volume <= 0) return "Volume unavailable";
  return `${volume.toLocaleString()} shares traded`;
}

function movementHeadline(item: MarketPulseIntelligenceRecord): string {
  const dir = item.direction === "up" ? "upward" : "downward";
  if (item.movementLabel.toLowerCase().includes("sharp")) {
    return `Significant ${dir} movement`;
  }
  return `Notable ${dir} movement`;
}

function PulseRow({
  item,
  catalystLookupComplete,
}: {
  item: MarketPulseIntelligenceRecord;
  catalystLookupComplete: boolean;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const authenticated = !!user;
  const positive = item.direction === "up";
  const catalyst = item.verifiedCatalyst;
  const catalystHref = publicWorkflowHref(item.symbol, "catalyst", authenticated);

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
                trackPublicDiscoveryNav({
                  from: "market_pulse",
                  to: "stock_detail",
                  symbol: item.symbol,
                });
                navigate(item.stockDetailPath);
              }}
              className="font-mono text-sm font-bold text-accent-blue hover:underline"
            >
              {item.symbol}
            </button>
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {movementHeadline(item)}
            </span>
          </div>
          <p className="mt-1 text-sm text-foreground tabular-nums">
            <span
              className={cn(
                "font-semibold",
                positive ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
              )}
            >
              {positive ? "+" : ""}
              {item.changePercent.toFixed(2)}%
            </span>
            <span className="text-muted-foreground"> · </span>
            <span>{formatVolume(item.volume)}</span>
            <span className="text-muted-foreground"> · </span>
            <span>${item.price.toFixed(2)}</span>
          </p>
          {item.observationLine ? (
            <p className="mt-1 text-[0.6875rem] leading-snug text-muted-foreground" title={item.observationLine}>
              Verified movement · {item.observationLine}
            </p>
          ) : item.observationTimeUnavailable ? (
            <p className="mt-1 text-[0.6875rem] text-muted-foreground">
              Verified movement · time unavailable · {marketPulseDelayDisclosure()}
            </p>
          ) : (
            <p className="mt-1 text-[0.6875rem] text-muted-foreground">Verified movement · {marketPulseDelayDisclosure()}</p>
          )}

          {catalyst ? (
            <div className="mt-2 space-y-1 rounded-sm border border-border/50 bg-muted/10 px-2 py-2">
              <p className="text-xs text-foreground">
                <span className="font-medium">{catalyst.label}:</span> {catalyst.title}
              </p>
              <p className="text-[0.6875rem] text-muted-foreground">
                {catalyst.sourceName}
                {catalyst.eventTimingLine ? ` · ${catalyst.eventTimingLine}` : null}
              </p>
              <p className="text-[0.6875rem] leading-snug text-muted-foreground">{MARKET_PULSE_CAUSATION_DISCLAIMER}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs">
                {catalyst.sourceUrl && (
                  <a
                    href={catalyst.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-blue hover:underline"
                  >
                    Source article
                  </a>
                )}
                {catalystHref && (
                  <Link
                    to={catalystHref}
                    className="text-accent-blue hover:underline"
                    onClick={() => trackPublicDashboardCta({
                      symbol: item.symbol,
                      destination: "catalyst",
                      authenticated,
                    })}
                  >
                    {authenticated ? "Catalyst workspace" : "Sign in · Catalyst"}
                  </Link>
                )}
                <Link to={item.stockDetailPath} className="text-accent-blue hover:underline">
                  Stock detail
                </Link>
              </div>
            </div>
          ) : catalystLookupComplete ? (
            <p className="mt-2 text-xs text-muted-foreground">{MARKET_PULSE_UNEXPLAINED_COPY}</p>
          ) : (
            <Skeleton className="mt-2 h-10 w-full max-w-md rounded-sm" />
          )}
        </div>
      </div>
    </article>
  );
}

export function MarketPulse() {
  const moversQuery = useHomepagePublicMovers();
  const marketClosed = resolveMarketSession() === "closed";

  const baseItems = useMemo(() => {
    if (!moversQuery.data) return [];
    return selectMarketPulseItems({
      gainers: moversQuery.data.gainers.movers,
      losers: moversQuery.data.losers.movers,
      provenance: moversQuery.data.combinedProvenance,
      nowMs: moversQuery.data.fetchedAtMs,
    });
  }, [moversQuery.data]);

  const pulseSymbols = useMemo(() => baseItems.map((i) => i.symbol), [baseItems]);

  const catalystQuery = useMarketPulseCatalystEnrichment(pulseSymbols);

  const enrichedItems = useMemo(() => {
    if (baseItems.length === 0) return [];
    const nowMs = moversQuery.data?.fetchedAtMs ?? Date.now();
    return attachMarketPulseCatalystContext(baseItems, catalystQuery.data, nowMs);
  }, [baseItems, catalystQuery.data, moversQuery.data?.fetchedAtMs]);

  const catalystLookupComplete =
    pulseSymbols.length === 0 || catalystQuery.isSuccess || catalystQuery.isError;

  const model = useMemo(() => {
    if (moversQuery.isLoading) return { status: "loading" as const, items: [] };
    if (moversQuery.isError) return { status: "error" as const, items: [] };
    const bundle = moversQuery.data;
    if (!bundle) return { status: "loading" as const, items: [] };

    if (enrichedItems.length === 0) {
      return {
        status: "empty" as const,
        items: [],
        provenance: bundle.combinedProvenance,
      };
    }

    return {
      status: "ready" as const,
      items: enrichedItems,
      provenance: bundle.combinedProvenance,
    };
  }, [moversQuery.isLoading, moversQuery.isError, moversQuery.data, enrichedItems]);

  return (
    <section aria-labelledby="market-pulse-heading" className="px-4 py-4">
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
              <PulseRow
                key={item.eventIdentity}
                item={item}
                catalystLookupComplete={catalystLookupComplete}
              />
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
