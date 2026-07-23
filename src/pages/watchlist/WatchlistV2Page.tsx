import { useWatchlistV2 } from "@/hooks/useWatchlistV2";
import { V2SummaryCards } from "@/components/watchlist-v2/V2SummaryCards";
import { WatchlistRowV2 } from "@/components/watchlist-v2/WatchlistRowV2";
import { V2AddSymbol } from "@/components/watchlist-v2/V2AddSymbol";
import { Card } from "@/components/ui/card";
import { usePageSeo } from "@/hooks/usePageSeo";

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
        <V2AddSymbol onAdd={addSymbol} disabled={isAdding} />
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
          {rows.map((row) => (
            <WatchlistRowV2
              key={row.ticker}
              row={row}
              onRefresh={refresh}
              onRemove={removeSymbol}
              isRefreshing={refreshingSymbol === row.ticker}
            />
          ))}
        </div>
      )}
    </div>
  );
}
