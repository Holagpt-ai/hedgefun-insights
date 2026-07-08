import { useEffect, useState } from "react";
import { Newspaper, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import NewsCategoryTabs from "@/components/news/NewsCategoryTabs";
import DashboardNewsList, { type NewsFeedItem } from "@/components/news/DashboardNewsList";
import EmptyNewsState from "@/components/news/EmptyNewsState";
import {
  NEWS_FEED_COPY, NEWS_FEED_LIMIT, type NewsCategoryValue,
} from "@/config/news-feed.config";

export default function DashboardNewsPage() {
  const [category, setCategory] = useState<NewsCategoryValue>("all");
  const [items, setItems] = useState<NewsFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        let q = supabase
          .from("market_news")
          .select("id, headline, source, url, category, published_at, image_url, description, publisher_favicon")
          .order("published_at", { ascending: false })
          .limit(NEWS_FEED_LIMIT);
        if (category !== "all") q = q.eq("category", category);
        const { data, error: err } = await q;
        if (err) throw err;
        if (!cancelled) setItems((data as NewsFeedItem[]) ?? []);
      } catch (e) {
        console.error("News feed load failed:", e);
        if (!cancelled) setError("Unable to load headlines. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [category]);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-5">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-accent-blue" />
          <h1 className="text-xl md:text-2xl font-semibold text-foreground">{NEWS_FEED_COPY.title}</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          {NEWS_FEED_COPY.subtitle}
        </p>
      </div>

      {/* Trust banner */}
      <div className="flex items-start gap-2.5 rounded-lg border border-accent-blue/30 bg-accent-blue-light/50 px-3.5 py-3">
        <Info className="h-4 w-4 text-accent-blue shrink-0 mt-0.5" />
        <div className="text-xs text-foreground leading-relaxed">
          {NEWS_FEED_COPY.trustBanner}
        </div>
      </div>

      {/* Category tabs */}
      <NewsCategoryTabs value={category} onChange={setCategory} />

      {/* Body */}
      {loading ? (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-lg border border-border bg-surface-card animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-border bg-surface-card px-4 py-8 text-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : items.length === 0 ? (
        <EmptyNewsState />
      ) : (
        <DashboardNewsList items={items} />
      )}

      {/* Footer disclaimer */}
      <p className="text-[11px] text-muted-foreground text-center pt-2">
        {NEWS_FEED_COPY.footerDisclaimer}
      </p>
    </div>
  );
}
