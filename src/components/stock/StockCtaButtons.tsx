import { Link, useNavigate } from "react-router-dom";
import { trackAuthHandoff, trackPublicDashboardCta } from "@/lib/analytics/public-events";
import { publicWorkflowHref } from "@/lib/public/public-workflow-links";
import { Button } from "@/components/ui/button";
import { ExternalLink, Plus, Copy } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  ticker: string;
}

export default function StockCtaButtons({ ticker }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleAddToWatchlist = async () => {
    console.log('[watchlist-add] user:', user?.id, 'symbol:', ticker);

    if (!user?.id) {
      const dest = publicWorkflowHref(ticker, "watchlist", false);
      if (dest) {
        trackAuthHandoff({ mode: "login", returnPath: dest, source: "stock_detail_watchlist" });
        navigate(dest);
      } else {
        toast.error("Sign in to save stocks to your watchlist");
      }
      return;
    }

    const { error } = await supabase
      .from("watchlists")
      .insert({
        symbol: ticker.toUpperCase(),
        user_id: user.id,
      });

    if (error) {
      if (error.code === "23505") {
        toast.info(`${ticker.toUpperCase()} is already in your watchlist`);
      } else {
        toast.error("Failed to add", { description: error.message });
        console.error('[watchlist-add] insert error:', error);
      }
      return;
    }

    queryClient.invalidateQueries({ queryKey: ["watchlist"] });
    queryClient.invalidateQueries({ queryKey: ["watchlist", user.id] });
    toast.success(`${ticker.toUpperCase()} added to watchlist`);
  };

  const watchlistHref = publicWorkflowHref(ticker, "watchlist", !!user);
  const catalystHref = publicWorkflowHref(ticker, "catalyst", !!user);

  return (
    <div className="flex flex-row flex-wrap gap-2">
      <Button
        onClick={() => navigate(`/chart/${ticker}`)}
      >
        <ExternalLink className="w-4 h-4 mr-1.5" />
        Full Chart
      </Button>
      <Button
        variant="outline"
        className="border-accent-blue text-accent-blue hover:bg-accent-blue/10"
        onClick={handleAddToWatchlist}
      >
        <Plus className="w-4 h-4 mr-1.5" />
        Watchlist
      </Button>
      <Button
        variant="outline"
        className="border-accent-blue text-accent-blue hover:bg-accent-blue/10"
        onClick={() => navigate(`/stocks/compare?tickers=${ticker}`)}
      >
        <Copy className="w-4 h-4 mr-1.5" />
        Compare
      </Button>
      {catalystHref && (
        <Button variant="outline" className="border-accent-blue text-accent-blue hover:bg-accent-blue/10" asChild>
          <Link
            to={catalystHref}
            onClick={() => trackPublicDashboardCta({
              symbol: ticker,
              destination: "catalyst",
              authenticated: !!user,
            })}
          >
            Catalyst
          </Link>
        </Button>
      )}
      {!user && watchlistHref && (
        <Button variant="ghost" className="text-xs text-muted-foreground" asChild>
          <Link
            to={watchlistHref}
            onClick={() => trackAuthHandoff({
              mode: "login",
              returnPath: watchlistHref,
              source: "stock_detail_cta",
            })}
          >
            Sign in for full workspace
          </Link>
        </Button>
      )}
    </div>
  );
}
