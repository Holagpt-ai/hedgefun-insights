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
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-3 py-3">
              <Skeleton className="w-20 h-20 sm:w-24 sm:h-24 rounded flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {(news ?? []).map((item: any) => {
            const timeAgo = item.published_at
              ? formatDistanceToNow(new Date(item.published_at), { addSuffix: false })
              : "";
            return (
              <a
                key={item.id}
                href={item.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-3 py-3 group hover:bg-muted/30 transition-colors duration-200 rounded px-2 -mx-2"
              >
                <div className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded overflow-hidden bg-muted flex items-center justify-center">
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.currentTarget;
                        target.style.display = "none";
                        const fallback = target.nextElementSibling as HTMLElement | null;
                        if (fallback) fallback.style.display = "flex";
                      }}
                    />
                  ) : null}
                  <div
                    className="w-full h-full items-center justify-center text-xs text-muted-foreground"
                    style={{ display: item.image_url ? "none" : "flex" }}
                  >
                    {item.publisher_favicon ? (
                      <img src={item.publisher_favicon} alt="" className="w-6 h-6" />
                    ) : (
                      <span>{(item.source ?? "?").charAt(0)}</span>
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 text-xs text-muted-foreground">
                    {item.publisher_favicon && (
                      <img src={item.publisher_favicon} alt="" className="w-3.5 h-3.5" />
                    )}
                    {item.source && <span className="font-medium">{item.source}</span>}
                    {timeAgo && (
                      <>
                        <span>·</span>
                        <span>{timeAgo} ago</span>
                      </>
                    )}
                  </div>

                  <h4 className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-accent-blue transition-colors mb-1">
                    {item.headline}
                  </h4>

                  {item.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>
              </a>
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
