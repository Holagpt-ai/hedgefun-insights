import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

export function MarketNews() {
  const navigate = useNavigate();
  const { data: news, isLoading } = useQuery({
    queryKey: ["market-news"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_news")
        .select("*")
        .order("published_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <div className="flex items-center gap-1 mb-3">
        <h3 className="text-base font-bold text-foreground">Market News</h3>
        <button onClick={() => navigate("/news")} className="text-base text-muted-foreground hover:text-accent-blue">›</button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded" />
          ))}
        </div>
      ) : (
        <div className="space-y-0">
          {(news ?? []).map((item) => {
            const timeAgo = item.published_at
              ? formatDistanceToNow(new Date(item.published_at), { addSuffix: false })
              : "";
            return (
              <div
                key={item.id}
                className="flex items-start gap-3 py-2 border-b border-border last:border-b-0"
              >
                <span className="text-xs text-muted-foreground w-[60px] shrink-0 pt-0.5 tabular-nums">
                  {timeAgo}
                </span>
                <div className="flex-1 min-w-0">
                  <a
                    href={item.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent-blue hover:underline leading-snug line-clamp-2"
                  >
                    {item.headline}
                  </a>
                  {item.source && (
                    <span className="text-xs text-muted-foreground ml-1">— {item.source}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <span className="text-xs text-muted-foreground">More News:</span>
        {["Markets", "Stocks", "IPOs", "ETFs"].map((label) => (
          <button
            key={label}
            onClick={() => navigate(`/${label.toLowerCase()}`)}
            className="text-xs text-accent-blue hover:underline"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
