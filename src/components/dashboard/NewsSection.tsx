import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ExternalLink } from "lucide-react";

interface NewsItem {
  id: string;
  headline: string;
  source: string | null;
  url: string | null;
  category: string | null;
  published_at: string;
}

interface NewsSectionProps {
  isPro: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  markets: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  stocks: "bg-green-500/10 text-green-400 border-green-500/20",
  ipo: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  etf: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  general: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
};

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function NewsSection({ isPro }: NewsSectionProps) {
  const { user } = useAuth();
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const limit = isPro ? 20 : 5;

  useEffect(() => {
    const fetchNews = async () => {
      if (!user) return;
      try {
        const { data, error } = await supabase
          .from("market_news")
          .select("*")
          .order("published_at", { ascending: false })
          .limit(limit);
        if (error) throw error;
        setNews((data as NewsItem[]) || []);
      } catch (err) {
        console.error("Failed to fetch news:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchNews();
  }, [user, limit]);

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 rounded-lg border border-border bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  if (news.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Market News</h2>
        {!isPro && (
          <span className="text-xs text-muted-foreground">
            Showing 5 of latest — PRO unlocks 20
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {news.map((item) => (
          <a
            key={item.id}
            href={item.url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 hover:border-accent-blue/40 hover:bg-card/80 transition-colors duration-200"
          >
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-accent-blue transition-colors">
                {item.headline}
              </span>
              <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                {item.category && (
                  <span
                    className={`px-2 py-0.5 rounded-full border ${
                      CATEGORY_COLORS[item.category.toLowerCase()] ?? CATEGORY_COLORS.general
                    }`}
                  >
                    {item.category}
                  </span>
                )}
                {item.source && <span>{item.source}</span>}
                <span>·</span>
                <span>{timeAgo(item.published_at)}</span>
              </div>
            </div>
            <ExternalLink className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5 group-hover:text-accent-blue transition-colors" />
          </a>
        ))}
      </div>

      {!isPro && (
        <p className="text-xs text-muted-foreground italic pt-1">
          Upgrade to PRO to see 20 headlines + full news feed access.
        </p>
      )}
    </div>
  );
}
