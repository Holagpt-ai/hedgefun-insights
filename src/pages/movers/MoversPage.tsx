import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getTopGainers, getTopLosers } from "@/lib/polygon";
import { Skeleton } from "@/components/ui/skeleton";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { usePageSeo } from "@/hooks/usePageSeo";
import { supabase } from "@/integrations/supabase/client";
import {
  currentMoversEmptyMessage,
  mapAfterHoursFeed,
  mapPolygonMovers,
  polygonTickersFromResponse,
  type MoverListRow,
  type MoverSession,
  type MoverSort,
} from "@/lib/markets/movers-integrity";
import { resolveMarketSession } from "@/lib/price-utils";

const TYPE_MAP: Record<string, { title: string }> = {
  gainers: { title: "Top Gainers" },
  losers: { title: "Top Losers" },
  active: { title: "Most Active" },
  premarket: { title: "Pre-Market Movers" },
  afterhours: { title: "After-Hours Movers" },
};

const TYPES = ["gainers", "losers", "active", "premarket", "afterhours"];

function sessionForType(type: string): MoverSession {
  if (type === "premarket") return "premarket";
  if (type === "afterhours") return "afterhours";
  return "regular";
}

function sortForType(type: string): MoverSort {
  if (type === "losers") return "percent_asc";
  if (type === "active") return "volume_desc";
  return "percent_desc";
}

async function fetchCanonicalMovers(type: string): Promise<MoverListRow[]> {
  if (type === "afterhours") {
    const [{ data: stateRows }, { data: resultRows }] = await Promise.all([
      supabase.from("after_hours_feed_state").select("state_key,generation_id,status").eq("state_key", "current").limit(1),
      supabase.from("after_hours_mover_results").select("generation_id,side,rank,symbol,company_name,extended_last,regular_close,change_percent,volume,provider_as_of"),
    ]);
    const gen = (stateRows ?? [])[0]?.generation_id;
    const matching = (resultRows ?? []).filter((r) => gen && r.generation_id === gen);
    return mapAfterHoursFeed(matching, { sort: "percent_desc" });
  }

  const kinds: Array<"gainers" | "losers"> =
    type === "losers" ? ["losers"] : type === "gainers" ? ["gainers"] : ["gainers", "losers"];
  const payloads = await Promise.all(kinds.map((k) => (k === "gainers" ? getTopGainers() : getTopLosers())));
  const combined = payloads.flatMap((p) => polygonTickersFromResponse(p));
  return mapPolygonMovers(combined, sessionForType(type), { sort: sortForType(type) }).rows;
}

const MoversPage = () => {
  const { type = "gainers" } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const config = TYPE_MAP[type] ?? TYPE_MAP.gainers;
  const marketClosed = resolveMarketSession() === "closed";

  const { data, isLoading } = useQuery({
    queryKey: ["movers", type],
    queryFn: () => fetchCanonicalMovers(type),
    staleTime: 60_000,
  });

  usePageSeo({
    title: "Stock Market Movers — Top Gainers & Losers | HedgeFun",
    description: "See today's top stock market movers including gainers, losers, and most active stocks on HedgeFun.",
  });

  const rows = data ?? [];

  return (
    <div className="p-4">
      <h1 className="text-lg font-bold text-foreground mb-3">{config.title}</h1>

      <div className="flex gap-1 mb-4 flex-wrap">
        {TYPES.map((t) => (
          <button
            key={t}
            onClick={() => navigate(`/movers/${t}`)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full transition-colors capitalize",
              t === type ? "bg-accent-blue text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {TYPE_MAP[t].title}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {currentMoversEmptyMessage({ hasSearchQuery: false, marketClosed })}
        </p>
      ) : (
        <div className="fintech-card overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b border-border">
                <th className="table-header text-left px-3 py-2">Symbol</th>
                <th className="table-header text-right px-3 py-2">Price</th>
                <th className="table-header text-right px-3 py-2">Change %</th>
                <th className="table-header text-right px-3 py-2 hidden sm:table-cell">Volume</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((m) => (
                <tr key={m.symbol} className="border-b border-border last:border-b-0 hover:bg-accent/50">
                  <td className="px-3 py-2">
                    <button onClick={() => { trackEvent("stock_search", { ticker: m.symbol }); navigate(`/stocks/${m.symbol.toLowerCase()}`); }} className="ticker-symbol text-accent-blue hover:underline text-sm">{m.symbol}</button>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">${m.price.toFixed(2)}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums font-medium", m.changePercent >= 0 ? "price-positive" : "price-negative")}>
                    {m.changePercent >= 0 ? "↑" : "↓"} {Math.abs(m.changePercent).toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">{m.volume.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MoversPage;
