import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdBanner } from "@/components/layout/AdBanner";
import { formatDistanceToNow, format } from "date-fns";
import { Newspaper, Play } from "lucide-react";
import { usePageSeo } from "@/hooks/usePageSeo";
import { subscribeToNewsletter } from "@/lib/newsletter";

const MARKET_DATA_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/market-data`;
const PAGE_SIZE = 20;

interface PolygonArticle {
  id: string;
  title: string;
  author: string;
  published_utc: string;
  article_url: string;
  image_url?: string;
  description?: string;
  publisher: { name: string; logo_url?: string };
  tickers?: string[];
}

interface NormalizedArticle {
  id: string;
  headline: string;
  source: string;
  published_at: string;
  url: string;
  image_url?: string;
  excerpt?: string;
  tickers: string[];
  isVideo: boolean;
}

function normalizePolygon(a: PolygonArticle, idx: number): NormalizedArticle {
  const videoSources = ["cnbc", "fox business", "bloomberg", "yahoo finance", "cnn business"];
  const isVideo = idx % 5 === 4 || videoSources.some((s) => a.publisher?.name?.toLowerCase().includes(s) && idx % 3 === 0);
  return {
    id: a.id || `poly-${idx}`,
    headline: a.title,
    source: a.publisher?.name ?? "Unknown",
    published_at: a.published_utc,
    url: a.article_url,
    image_url: a.image_url,
    excerpt: a.description,
    tickers: a.tickers?.slice(0, 4) ?? [],
    isVideo,
  };
}

function normalizeSupa(item: any, idx: number): NormalizedArticle {
  return {
    id: item.id,
    headline: item.headline,
    source: item.source ?? "Source unavailable",
    published_at: item.published_at,
    url: item.url ?? "#",
    image_url: undefined,
    excerpt: undefined,
    tickers: [],
    isVideo: idx % 5 === 4,
  };
}

async function fetchPolygonNews(limit = 50): Promise<NormalizedArticle[]> {
  const url = new URL(MARKET_DATA_URL);
  url.searchParams.set("type", "news");
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error("Polygon fetch failed");
  const data = await res.json();
  return (data as PolygonArticle[]).map(normalizePolygon);
}

async function fetchSupabaseNews(): Promise<NormalizedArticle[]> {
  const { data, error } = await supabase
    .from("market_news")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []).map(normalizeSupa);
}

function timeLabel(dateStr: string) {
  try {
    const d = new Date(dateStr);
    const diff = Date.now() - d.getTime();
    if (diff < 86400000) return formatDistanceToNow(d, { addSuffix: true });
    return format(d, "MMM d, h:mm a");
  } catch {
    return "";
  }
}

function ImageWithFallback({ src, alt, className, isVideo }: { src?: string; alt: string; className?: string; isVideo?: boolean }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className={`${className} bg-muted flex items-center justify-center`}>
        <Newspaper className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className={`${className} relative overflow-hidden`}>
      <img
        loading="lazy"
        src={src}
        alt={alt}
        width={160}
        height={100}
        className="w-full h-full object-cover"
        onError={() => setErr(true)}
      />
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="w-12 h-12 rounded-full bg-black/60 flex items-center justify-center">
            <Play className="h-5 w-5 text-white fill-white ml-0.5" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Featured (first) article ─── */
function FeaturedArticle({ article }: { article: NormalizedArticle }) {
  const navigate = useNavigate();
  return (
    <div className="pb-4 mb-2 border-b border-border">
      <a href={article.url} target="_blank" rel="noopener noreferrer" className="block">
        <div className="w-full h-[220px] rounded-[var(--radius)] overflow-hidden mb-3">
          <ImageWithFallback src={article.image_url} alt={article.headline} className="w-full h-full" isVideo={article.isVideo} />
        </div>
      </a>
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs font-semibold uppercase" style={{ color: "hsl(var(--text-muted))" }}>{article.source}</span>
        <span className="text-xs" style={{ color: "hsl(var(--text-muted))" }}>·</span>
        <span className="text-xs" style={{ color: "hsl(var(--text-muted))" }}>{timeLabel(article.published_at)}</span>
      </div>
      <a href={article.url} target="_blank" rel="noopener noreferrer" className="block text-[1.25rem] font-bold leading-snug hover:underline" style={{ color: "hsl(var(--accent-blue))" }}>
        {article.headline}
      </a>
      {article.excerpt && (
        <p className="mt-1 text-sm leading-snug line-clamp-2" style={{ color: "hsl(var(--text-secondary))" }}>{article.excerpt}</p>
      )}
      {article.tickers.length > 0 && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {article.tickers.map((t) => (
            <button key={t} onClick={() => navigate(`/stocks/${t}`)} className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: "hsl(var(--accent-blue))", background: "hsl(var(--accent-blue-light))" }}>
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Standard article card ─── */
function ArticleCard({ article }: { article: NormalizedArticle }) {
  const navigate = useNavigate();
  return (
    <div className="flex gap-4 py-4 border-b" style={{ borderColor: "hsl(var(--border-subtle))" }}>
      <a href={article.url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
        <ImageWithFallback
          src={article.image_url}
          alt={article.headline}
          className="w-[160px] h-[100px] rounded-[var(--radius)]"
          isVideo={article.isVideo}
        />
      </a>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-xs font-semibold uppercase" style={{ color: "hsl(var(--text-muted))" }}>{article.source}</span>
          <span className="text-xs" style={{ color: "hsl(var(--text-muted))" }}>·</span>
          <span className="text-xs" style={{ color: "hsl(var(--text-muted))" }}>{timeLabel(article.published_at)}</span>
        </div>
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="block text-[0.9375rem] font-semibold leading-snug hover:underline line-clamp-2" style={{ color: "hsl(var(--accent-blue))" }}>
          {article.headline}
        </a>
        {article.excerpt && (
          <p className="mt-1 text-sm leading-snug line-clamp-2" style={{ color: "hsl(var(--text-secondary))" }}>{article.excerpt}</p>
        )}
        {article.tickers.length > 0 && (
          <div className="flex gap-1.5 mt-1.5 flex-wrap">
            {article.tickers.map((t) => (
              <button key={t} onClick={() => navigate(`/stocks/${t}`)} className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: "hsl(var(--accent-blue))", background: "hsl(var(--accent-blue-light))" }}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Skeleton loader ─── */
function ArticleSkeleton() {
  return (
    <div className="flex gap-4 py-4 border-b border-border">
      <Skeleton className="w-[160px] h-[100px] rounded-[var(--radius)] flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
  );
}

/* ─── Sidebar ─── */
function NewsSidebar() {
  const [email, setEmail] = useState("");
  const [nlLoading, setNlLoading] = useState(false);
  const [nlStatus, setNlStatus] = useState<"idle" | "success" | "duplicate" | "invalid" | "error">("idle");
  const navigate = useNavigate();

  const handleSubscribe = async () => {
    setNlLoading(true);
    setNlStatus("idle");
    const result = await subscribeToNewsletter(email, "news_sidebar");
    setNlStatus(result.status);
    setNlLoading(false);
  };

  const { data: trending } = useQuery({
    queryKey: ["trending-tickers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stocks")
        .select("symbol, name, price, change_percent")
        .order("volume", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  return (
    <aside className="w-[300px] shrink-0 hidden md:flex flex-col gap-4 sticky top-[80px] self-start">
      {/* Ad top */}
      <AdBanner />

      {/* Newsletter */}
      <div className="fintech-card p-4">
        <h3 className="text-base font-bold mb-1" style={{ color: "hsl(var(--text-primary))" }}>Market Newsletter</h3>
        <p className="text-sm mb-3" style={{ color: "hsl(var(--text-secondary))" }}>
          Get a daily email with the top financial news in bullet point format.
        </p>
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="mb-2"
        />
        <Button
          onClick={handleSubscribe}
          disabled={nlLoading}
          className="w-full disabled:opacity-50"
          style={{ background: "hsl(var(--accent-blue))", color: "#fff" }}
        >
          {nlLoading ? "Subscribing..." : "Subscribe"}
        </Button>
        {nlStatus === "success" && <p className="text-xs text-green-600 mt-2">✓ Subscribed!</p>}
        {nlStatus === "duplicate" && <p className="text-xs text-yellow-600 mt-2">Already subscribed</p>}
        {nlStatus === "invalid" && <p className="text-xs text-destructive mt-2">Enter a valid email</p>}
        {nlStatus === "error" && <p className="text-xs text-destructive mt-2">Try again</p>}
      </div>

      {/* Ad mid */}
      <AdBanner />

      {/* Trending tickers */}
      <div className="fintech-card p-4">
        <h3 className="text-base font-bold mb-3" style={{ color: "hsl(var(--text-primary))" }}>Trending Tickers</h3>
        <div className="space-y-0">
          {(trending ?? []).map((s, i) => (
            <div
              key={s.symbol}
              className="flex items-center justify-between py-2 cursor-pointer hover:bg-muted/50 -mx-2 px-2 rounded-sm"
              style={{ borderBottom: i < (trending?.length ?? 0) - 1 ? "1px solid hsl(var(--border-subtle))" : "none" }}
              onClick={() => navigate(`/stocks/${s.symbol}`)}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm font-bold" style={{ color: "hsl(var(--accent-blue))" }}>{s.symbol}</span>
                <span className="text-xs truncate" style={{ color: "hsl(var(--text-muted))" }}>{s.name}</span>
              </div>
              <span className={`text-xs font-medium tabular-nums ${(s.change_percent ?? 0) >= 0 ? "price-positive" : "price-negative"}`}>
                {(s.change_percent ?? 0) >= 0 ? "+" : ""}{(s.change_percent ?? 0).toFixed(2)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Ad bottom */}
      <AdBanner />
    </aside>
  );
}

/* ─── Main page ─── */
const NewsPage = () => {
  const [articles, setArticles] = useState<NormalizedArticle[]>([]);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchNews = useCallback(async () => {
    try {
      const data = await fetchPolygonNews(50);
      setArticles(data);
      setLastUpdated(new Date());
    } catch {
      try {
        const data = await fetchSupabaseNews();
        setArticles(data);
        setLastUpdated(new Date());
      } catch {
        /* fail silently */
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
    intervalRef.current = setInterval(fetchNews, 300000);
    return () => clearInterval(intervalRef.current);
  }, [fetchNews]);

  const handleLoadMore = async () => {
    setLoadingMore(true);
    // If we have more cached articles, show them
    if (visibleCount + PAGE_SIZE <= articles.length) {
      setVisibleCount((c) => c + PAGE_SIZE);
      setLoadingMore(false);
      return;
    }
    // Otherwise fetch more from Polygon
    try {
      const more = await fetchPolygonNews(visibleCount + PAGE_SIZE + 20);
      setArticles(more);
      setVisibleCount((c) => c + PAGE_SIZE);
    } catch {
      setVisibleCount((c) => Math.min(c + PAGE_SIZE, articles.length));
    } finally {
      setLoadingMore(false);
    }
  };

  const visibleArticles = articles.slice(0, visibleCount);
  const featured = visibleArticles[0];
  const rest = visibleArticles.slice(1);

  usePageSeo({
    title: "Stock Market News & Financial Analysis | Stocksist",
    description: "Get the latest stock market news, earnings coverage, economic updates, and financial analysis on Stocksist.",
  });

  return (
    <div className="flex gap-6 p-4 max-w-full">
      {/* Main feed */}
      <div className="flex-1 min-w-0">
        <h1 className="text-[1.75rem] font-bold mb-4 text-foreground">Market News</h1>
        {/* Last updated */}
        {lastUpdated && (
          <div className="flex justify-end mb-2">
            <span className="text-xs" style={{ color: "hsl(var(--text-muted))" }}>
              Last updated {format(lastUpdated, "h:mm a")}
            </span>
          </div>
        )}

        {loading ? (
          <div>
            {/* Featured skeleton */}
            <div className="pb-4 mb-2 border-b border-border">
              <Skeleton className="w-full h-[220px] rounded-[var(--radius)] mb-3" />
              <Skeleton className="h-3 w-32 mb-2" />
              <Skeleton className="h-6 w-3/4 mb-1" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <ArticleSkeleton />
            <ArticleSkeleton />
            <ArticleSkeleton />
          </div>
        ) : (
          <>
            {featured && <FeaturedArticle article={featured} />}
            {rest.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
            {visibleCount < articles.length && (
              <div className="flex justify-center mt-6 mb-4">
                <button
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-8 py-2.5 text-sm font-medium rounded-[var(--radius)] border transition-colors hover:bg-muted disabled:opacity-50"
                  style={{ borderColor: "hsl(var(--border))", color: "hsl(var(--text-primary))" }}
                >
                  {loadingMore ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Loading…
                    </span>
                  ) : (
                    "Load More"
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sidebar */}
      <NewsSidebar />
    </div>
  );
};

export default NewsPage;
