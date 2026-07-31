import { WatchlistWorkspace } from "@/components/watchlist-v2/WatchlistWorkspace";
import { usePageSeo } from "@/hooks/usePageSeo";
import { normalizeHandoffSymbol } from "@/lib/watchlist-v2/handoff";

export { normalizeHandoffSymbol };

/**
 * Shared Watchlist page body used by both public `/watchlist` and
 * dashboard `/dashboard/watchlist` shells.
 */
export default function WatchlistV2Page() {
  usePageSeo({
    title: "Watchlist · Stocksist",
    description:
      "Institutional Watchlist Command Center with scoreless signals, verified catalysts, and earnings countdown.",
  });

  return <WatchlistWorkspace />;
}
