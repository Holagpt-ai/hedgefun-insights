import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useWatchlistV2 } from "@/hooks/useWatchlistV2";
import { V2SummaryCards } from "@/components/watchlist-v2/V2SummaryCards";
import { WatchlistRowV2 } from "@/components/watchlist-v2/WatchlistRowV2";
import { V2AddSymbol } from "@/components/watchlist-v2/V2AddSymbol";
import { Card } from "@/components/ui/card";
import { usePageSeo } from "@/hooks/usePageSeo";
import { cn } from "@/lib/utils";

const SYMBOL_RE = /^[A-Z][A-Z0-9.-]{0,14}$/;

/** Normalize a raw query symbol to canonical form, or null when invalid. */
export function normalizeHandoffSymbol(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().toUpperCase();
  return SYMBOL_RE.test(t) ? t : null;
}

export default function WatchlistV2Page() {
  usePageSeo({
    title: "Watchlist V2 · Stocksist",
    description: "Scoreless institutional watchlist with deterministic signals and verified events.",
  });

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

  const rowRefs = useRef(new Map<string, HTMLDivElement | null>());
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const lastHandledRef = useRef<string | null>(null);

  const existingTickers = useMemo(
    () => new Set(rows.map((r) => r.ticker.toUpperCase())),
    [rows],
  );

  // If the handoff symbol already exists, highlight and scroll; do NOT insert.
  useEffect(() => {
    if (!handoff || isLoading) return;
    if (!existingTickers.has(handoff)) return;
    if (lastHandledRef.current === handoff) return;
    lastHandledRef.current = handoff;

    setHighlighted(handoff);
    const el = rowRefs.current.get(handoff);
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const timer = setTimeout(() => setHighlighted(null), 2500);
    return () => clearTimeout(timer);
  }, [handoff, isLoading, existingTickers]);

  // Only prefill Add input when the ticker is NOT already on the watchlist.
  const prefillSymbol = handoff && !existingTickers.has(handoff) ? handoff : null;

  if (!isAuthenticated) {
    return (
      <div className="p-6">
        <Card className="p-8 text-center">
          <h1 className="text-xl font-semibold mb-2">Sign in to view your watchlist</h1>
          <p className="text-sm text-muted-foreground">
            Your Watchlist V2 uses your authenticated account.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Watchlist</h1>
          <p className="text-sm text-muted-foreground">
            Scoreless signals · 15-minute delayed feed
          </p>
        </div>
        <V2AddSymbol onAdd={addSymbol} disabled={isAdding} initialSymbol={prefillSymbol} />
      </header>

      <V2SummaryCards rows={rows} />

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading watchlist…</div>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="text-lg font-medium mb-1">Your watchlist is empty</div>
          <div className="text-sm text-muted-foreground">
            Add a ticker above to begin analysis.
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const isHighlighted = highlighted === row.ticker.toUpperCase();
            return (
              <div
                key={row.ticker}
                ref={(el) => rowRefs.current.set(row.ticker.toUpperCase(), el)}
                data-ticker={row.ticker.toUpperCase()}
                className={cn(
                  "rounded-lg transition-shadow",
                  isHighlighted &&
                    "ring-2 ring-accent-blue ring-offset-2 ring-offset-background shadow-lg",
                )}
              >
                <WatchlistRowV2
                  row={row}
                  onRefresh={refresh}
                  onRemove={removeSymbol}
                  isRefreshing={refreshingSymbol === row.ticker}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
