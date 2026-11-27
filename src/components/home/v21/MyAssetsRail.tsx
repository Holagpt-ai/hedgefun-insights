import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { trackAuthHandoff } from "@/lib/analytics/public-events";
import { useHomepageWatchlistAssets } from "@/hooks/useHomepageWatchlistAssets";
import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";
import { publicStockDetailPath } from "@/lib/public/public-workflow-links";
import { useState } from "react";
import { AuthModals } from "@/components/auth/AuthModals";
import { cn } from "@/lib/utils";

export function MyAssetsRail() {
  const { user } = useAuth();
  const assetsQuery = useHomepageWatchlistAssets();
  const [authMode, setAuthMode] = useState<"login" | "signup" | null>(null);

  return (
    <section aria-labelledby="my-assets-heading" className="hp-card">
      <div className="px-4 pt-4 pb-0">
        <h2 id="my-assets-heading" className="text-base font-extrabold">
          My Assets
        </h2>
        <p className="text-xs text-[var(--hp-ink-3)]">Watchlist · not proof of ownership</p>
      </div>
      <div className="px-4 py-4">
        {!user ? (
          <div className="text-center">
            <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-[var(--hp-blue)]">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-extrabold">Track your watchlist</h3>
            <p className="mt-1 text-xs text-[var(--hp-ink-2)]">
              Sign in to see saved symbols with delayed quotes on this device only.
            </p>
            <button
              type="button"
              className="mt-3 w-full rounded-lg bg-[var(--hp-blue)] py-2 text-sm font-bold text-white"
              onClick={() => {
                trackAuthHandoff({ mode: "login", returnPath: "/", source: "homepage_my_assets" });
                setAuthMode("login");
              }}
            >
              Log in
            </button>
          </div>
        ) : assetsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : assetsQuery.isError ? (
          <p className="text-sm text-[var(--hp-ink-2)]">Could not load your watchlist. Try again later.</p>
        ) : assetsQuery.isEmpty ? (
          <p className="text-sm text-[var(--hp-ink-2)]">
            No symbols saved yet.{" "}
            <Link to="/watchlist" className="font-bold text-[var(--hp-blue)]">
              Open Watchlist
            </Link>
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {(assetsQuery.data ?? []).map((row) => {
                const pct = row.changePercent;
                const positive = pct !== null && pct >= 0;
                return (
                  <li key={row.symbol}>
                    <Link
                      to={publicStockDetailPath(row.symbol)}
                      className="flex items-center justify-between rounded-lg px-1 py-1.5 hover:bg-muted/30"
                    >
                      <span>
                        <span className="font-mono font-extrabold">{row.symbol}</span>
                        {row.name ? (
                          <span className="ml-2 truncate text-xs text-[var(--hp-ink-3)]">{row.name}</span>
                        ) : null}
                      </span>
                      <span className="text-right text-xs">
                        {row.price !== null ? (
                          <span className="hp-num font-semibold">${row.price.toFixed(2)}</span>
                        ) : (
                          <span className="text-[var(--hp-ink-3)]">—</span>
                        )}
                        {pct !== null ? (
                          <span
                            className={cn(
                              "ml-2 hp-num font-bold",
                              positive ? "text-[var(--hp-up)]" : "text-[var(--hp-down)]",
                            )}
                          >
                            {positive ? "+" : ""}
                            {pct.toFixed(2)}%
                          </span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {assetsQuery.quotesUnavailable ? (
              <p className="mt-2 text-xs text-[var(--hp-ink-3)]">
                Delayed market data temporarily unavailable for some symbols.
              </p>
            ) : null}
          </>
        )}
        <p className="mt-3 text-[10px] text-[var(--hp-ink-3)]">{PUBLIC_MARKET_DATA_DELAY_DISCLOSURE}</p>
        {user ? (
          <Link to="/watchlist" className="mt-2 block text-center text-xs font-bold text-[var(--hp-blue)]">
            View full Watchlist →
          </Link>
        ) : null}
      </div>
      <AuthModals mode={authMode} onClose={() => setAuthMode(null)} onSwitch={setAuthMode} />
    </section>
  );
}