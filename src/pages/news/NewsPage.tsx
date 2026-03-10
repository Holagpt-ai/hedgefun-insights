import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

const CATEGORIES = [
  { label: "All", value: "all" },
  { label: "Markets", value: "markets" },
  { label: "Stocks", value: "stocks" },
  { label: "IPOs", value: "ipo" },
  { label: "ETFs", value: "etf" },
];

const NewsPage = () => {
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const { data, isLoading } = useQuery({
    queryKey: ["news-page", category],
    queryFn: async () => {
      let query = supabase.from("market_news").select("*").order("published_at", { ascending: false }).limit(200);
      if (category !== "all") query = query.eq("category", category);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const pageData = (data ?? []).slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil((data ?? []).length / PAGE_SIZE);

  return (
    <div className="p-4">
      <h1 className="text-lg font-bold text-foreground mb-4">Market News</h1>

      <div className="flex gap-1 mb-4 flex-wrap">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => { setCategory(c.value); setPage(0); }}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full transition-colors",
              c.value === category ? "bg-accent-blue text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <>
          <div className="space-y-0">
            {pageData.map((item) => (
              <div key={item.id} className="flex items-start gap-3 py-3 border-b border-border last:border-b-0">
                <span className="text-xs text-muted-foreground w-[60px] shrink-0 pt-0.5 tabular-nums">
                  {item.published_at ? formatDistanceToNow(new Date(item.published_at), { addSuffix: false }) : ""}
                </span>
                <div className="flex-1 min-w-0">
                  <a href={item.url ?? "#"} target="_blank" rel="noopener noreferrer" className="text-sm text-accent-blue hover:underline leading-snug">
                    {item.headline}
                  </a>
                  {item.source && <span className="text-xs text-muted-foreground ml-2">— {item.source}</span>}
                  {item.category && (
                    <span className="ml-2 text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded capitalize">{item.category}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
              <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default NewsPage;
