import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { trackPublicDiscoveryNav } from "@/lib/analytics/public-events";
import { publicWorkflowHref } from "@/lib/public/public-workflow-links";
import { useHomepagePublicMovers } from "@/hooks/useHomepagePublicMovers";
import { useMarketPulseCatalystEnrichment } from "@/hooks/useMarketPulseCatalystEnrichment";
import {
  attachMarketPulseCatalystContext,
  MARKET_PULSE_CAUSATION_DISCLAIMER,
  MARKET_PULSE_ROW_NO_CATALYST,
} from "@/lib/markets/market-pulse-catalyst";
import {
  marketPulseDelayDisclosure,
  selectMarketPulseItems,
} from "@/lib/markets/market-pulse-select";
import {
  moversFetchErrorMessage,
  moversSuccessfulEmptyMessage,
} from "@/lib/markets/movers-provenance";
import { resolveMarketSession } from "@/lib/price-utils";
import type { MarketPulseIntelligenceRecord } from "@/lib/markets/market-pulse-contract";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/useMediaQuery";

function MoveDetailBody({
  item,
  catalystLookupComplete,
}: {
  item: MarketPulseIntelligenceRecord;
  catalystLookupComplete: boolean;
}) {
  const { user } = useAuth();
  const catalyst = item.verifiedCatalyst;
  const catalystHref = publicWorkflowHref(item.symbol, "catalyst", !!user);
  return (
    <div className="space-y-3 text-sm">
      <p className="hp-num text-2xl font-extrabold">
        <span className={item.direction === "up" ? "text-[var(--hp-up)]" : "text-[var(--hp-down)]"}>
          {item.direction === "up" ? "+" : ""}
          {item.changePercent.toFixed(2)}%
        </span>
        <span className="ml-2 text-[var(--hp-ink-2)]">${item.price.toFixed(2)}</span>
      </p>
      <p className="text-[var(--hp-ink-2)]">
        Volume: {item.volume?.toLocaleString() ?? "unavailable"} · {marketPulseDelayDisclosure()}
      </p>
      {item.observationLine ? <p className="text-xs text-[var(--hp-ink-3)]">{item.observationLine}</p> : null}
      {catalyst ? (
        <div className="rounded-lg border border-[var(--hp-line)] bg-muted/20 p-3">
          <p className="font-semibold">{catalyst.label}</p>
          <p>{catalyst.title}</p>
          <p className="text-xs text-[var(--hp-ink-3)]">{catalyst.sourceName}</p>
          <p className="mt-2 text-xs text-[var(--hp-ink-3)]">{MARKET_PULSE_CAUSATION_DISCLAIMER}</p>
          {catalystHref ? (
            <Link to={catalystHref} className="mt-2 inline-block text-xs font-bold text-[var(--hp-blue)]">
              Catalyst workspace →
            </Link>
          ) : null}
        </div>
      ) : catalystLookupComplete ? (
        <p className="text-xs text-[var(--hp-ink-3)]">{MARKET_PULSE_ROW_NO_CATALYST}</p>
      ) : (
        <Skeleton className="h-12 w-full" />
      )}
    </div>
  );
}

function FeaturedMove({
  item,
  featured,
  onOpen,
}: {
  item: MarketPulseIntelligenceRecord;
  featured: boolean;
  onOpen: () => void;
}) {
  const positive = item.direction === "up";
  const catalystTag = item.verifiedCatalyst ? "Catalyst found" : "No catalyst linked yet";
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "w-full text-left transition-colors hover:bg-muted/20",
        featured ? "border-b border-[var(--hp-line)] p-4" : "flex items-center gap-3 border-b border-[var(--hp-line)] px-4 py-3 last:border-b-0",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "grid shrink-0 place-items-center rounded-lg font-extrabold text-white",
            featured ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs",
          )}
          style={{ background: positive ? "var(--hp-up)" : "var(--hp-down)" }}
        >
          {item.symbol.slice(0, 4)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-base font-extrabold">{item.symbol}</span>
            {featured && item.name ? (
              <span className="truncate text-xs text-[var(--hp-ink-2)]">{item.name}</span>
            ) : null}
            <span
              className={cn(
                "ml-auto hp-num text-base font-extrabold",
                positive ? "text-[var(--hp-up)]" : "text-[var(--hp-down)]",
              )}
            >
              {positive ? "+" : ""}
              {item.changePercent.toFixed(2)}%
            </span>
          </div>
          {featured && item.verifiedCatalyst ? (
            <p className="mt-2 line-clamp-3 text-sm text-[var(--hp-ink)]">{item.verifiedCatalyst.title}</p>
          ) : null}
          <span
            className={cn(
              "mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold",
              item.verifiedCatalyst
                ? "border-blue-200 bg-blue-50 text-[var(--hp-blue)]"
                : "border-[var(--hp-line)] text-[var(--hp-ink-3)]",
            )}
          >
            {catalystTag}
          </span>
        </div>
      </div>
    </button>
  );
}

export function SignificantMarketMovesV21() {
  const moversQuery = useHomepagePublicMovers();
  const marketClosed = resolveMarketSession() === "closed";
  const isMobile = useMediaQuery("(max-width: 767px)");
  const navigate = useNavigate();
  const [selected, setSelected] = useState<MarketPulseIntelligenceRecord | null>(null);

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

  const featured = enrichedItems.slice(0, 3);
  const also = enrichedItems.slice(3, 8);

  return (
    <section aria-labelledby="sig-moves-heading" className="hp-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 pt-4">
        <h2 id="sig-moves-heading" className="text-base font-extrabold">
          Significant Market Moves
        </h2>
        <span className="text-xs text-[var(--hp-ink-3)]">{marketPulseDelayDisclosure()}</span>
      </div>

      {moversQuery.isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : moversQuery.isError ? (
        <p className="p-4 text-sm text-[var(--hp-ink-2)]">{moversFetchErrorMessage()}</p>
      ) : featured.length === 0 ? (
        <p className="p-4 text-sm text-[var(--hp-ink-2)]">{moversSuccessfulEmptyMessage({ marketClosed })}</p>
      ) : (
        <>
          <div className="lg:grid lg:grid-cols-[1.25fr_1fr]">
            {featured.map((item, idx) => (
              <FeaturedMove
                key={item.eventIdentity}
                item={item}
                featured={idx === 0}
                onOpen={() => {
                  trackPublicDiscoveryNav({
                    from: "market_pulse_v21",
                    to: "stock_detail",
                    symbol: item.symbol,
                  });
                  setSelected(item);
                }}
              />
            ))}
          </div>
          {also.length > 0 && (
            <div className="border-t border-[var(--hp-line)] bg-muted/10 px-4 py-2">
              <span className="text-xs font-bold text-[var(--hp-ink-2)]">Also moving: </span>
              {also.map((item) => (
                <button
                  key={item.eventIdentity}
                  type="button"
                  className="also-pill mr-1 mt-1 inline-flex rounded-full border border-[var(--hp-line)] bg-white px-2 py-0.5 text-xs font-bold"
                  onClick={() => navigate(item.stockDetailPath)}
                >
                  {item.symbol}{" "}
                  <span className="hp-num text-[var(--hp-ink-2)]">
                    {item.changePercent >= 0 ? "+" : ""}
                    {item.changePercent.toFixed(1)}%
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {selected && !isMobile && (
        <Dialog open onOpenChange={(open) => !open && setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {selected.symbol} · {selected.name ?? "Significant move"}
              </DialogTitle>
            </DialogHeader>
            <MoveDetailBody item={selected} catalystLookupComplete={catalystLookupComplete} />
          </DialogContent>
        </Dialog>
      )}
      {selected && isMobile && (
        <Sheet open onOpenChange={(open) => !open && setSelected(null)}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
            <SheetHeader>
              <SheetTitle>{selected.symbol}</SheetTitle>
            </SheetHeader>
            <MoveDetailBody item={selected} catalystLookupComplete={catalystLookupComplete} />
          </SheetContent>
        </Sheet>
      )}
    </section>
  );
}