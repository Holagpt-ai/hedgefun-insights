import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePageSeo } from "@/hooks/usePageSeo";

import starlinkImg from "@/assets/articles/starlink-ipo.jpg";
import oilImg from "@/assets/articles/rising-oil-prices.jpg";
import fiboImg from "@/assets/articles/fibonacci-retracement.jpg";
import aiImg from "@/assets/articles/ai-infrastructure.jpg";
import energyImg from "@/assets/articles/energy-stocks-grid.jpg";

export interface Article {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  image: string;
  author?: string;
  tags?: string[];
  externalUrl?: string;
}

const FALLBACK_ARTICLES: Article[] = [
  {
    slug: "starlink-ipo-what-investors-need-to-know",
    title: "Starlink IPO: What Investors Need to Know Before It Goes Public",
    excerpt:
      "SpaceX's Starlink division is one of the most anticipated IPOs in years. Here's what the financials look like and how to position before it launches.",
    date: "Jan 15, 2026",
    image: starlinkImg,
    tags: ["IPO", "Tech"],
  },
  {
    slug: "rising-oil-prices-whats-driving-the-surge",
    title: "Rising Oil Prices: What's Driving the Surge and Who Benefits",
    excerpt:
      "Crude oil has been climbing steadily. We break down the macro forces at play and the energy stocks best positioned to capitalize.",
    date: "Feb 3, 2026",
    image: oilImg,
    tags: ["Energy", "Markets"],
  },
  {
    slug: "the-perfect-retracement-setup-a-trade-breakdown",
    title: "The Perfect Retracement Setup: A Trade Breakdown",
    excerpt:
      "One of the cleanest technical setups in trading is the Fibonacci retracement. Here's a real example with entry, stop, and target levels.",
    date: "Feb 18, 2026",
    image: fiboImg,
    tags: ["Analysis", "Trading"],
  },
  {
    slug: "ai-infrastructure-the-mega-scalers-building-the-future",
    title: "AI Infrastructure: The Mega Scalers Building the Future",
    excerpt:
      "Microsoft, Google, Amazon, and Meta are spending hundreds of billions on AI infrastructure. Here's what that means for investors and which picks stand out.",
    date: "Mar 1, 2026",
    image: aiImg,
    tags: ["Tech", "Analysis"],
  },
  {
    slug: "energy-stocks-to-watch-as-the-grid-demands-more-power",
    title: "Energy Stocks to Watch as the Grid Demands More Power",
    excerpt:
      "The AI boom is driving unprecedented electricity demand. We look at the energy companies best positioned to power the next decade of growth.",
    date: "Mar 10, 2026",
    image: energyImg,
    tags: ["Energy", "Markets"],
  },
];

export const ARTICLES = FALLBACK_ARTICLES;

export function getReadTime(wordCount: number): string {
  return `${Math.max(1, Math.ceil(wordCount / 200))} min read`;
}

const ARTICLES_PER_PAGE = 20;

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function ArticlesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const { data: dbNews = [] } = useQuery<Article[]>({
    queryKey: ["market-news-articles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_news")
        .select("id, headline, source, url, published_at, category")
        .order("published_at", { ascending: false })
        .limit(100);
      if (error) return [];
      return (data ?? []).map((row: any) => ({
        slug: slugify(row.headline ?? row.id),
        title: row.headline,
        excerpt: `${row.source ? row.source + " — " : ""}Read the full story on the original source.`,
        date: formatDate(row.published_at),
        image: getCategoryImage(row.category),
        author: row.source ?? "HedgeFun News",
        tags: row.category ? [row.category] : ["Markets"],
        externalUrl: row.url,
      }));
    },
    staleTime: 5 * 60 * 1000,
  });

  const articles: Article[] = dbNews.length > 0 ? dbNews : FALLBACK_ARTICLES;

  const ALL_TAGS = useMemo(
    () => Array.from(new Set(articles.flatMap((a) => a.tags ?? []))).sort(),
    [articles]
  );

  const filtered = useMemo(() => {
    let result = articles;
    if (activeTag) result = result.filter((a) => a.tags?.includes(activeTag));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.excerpt.toLowerCase().includes(q)
      );
    }
    return result;
  }, [search, activeTag, articles]);

  const paginatedArticles = filtered.slice(0, page * ARTICLES_PER_PAGE);

  const updateSearch = (v: string) => {
    setSearch(v);
    setPage(1);
  };
  const updateTag = (t: string | null) => {
    setActiveTag(t);
    setPage(1);
  };

  const handleArticleClick = (article: Article) => {
    if (article.externalUrl) {
      window.open(article.externalUrl, "_blank", "noopener,noreferrer");
    } else {
      navigate(`/articles/${article.slug}`);
    }
  };

  usePageSeo({
    title: "HedgeFun Blog — Latest Articles on Stocks, Finance & Investing",
    description:
      "Read in-depth articles on stocks, ETFs, IPOs, market analysis, and investing strategies from the HedgeFun team.",
    canonical: "https://www.hedgefun.fun/articles",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "Blog",
      name: "HedgeFun Blog",
      description: "Latest articles on stocks, finance, and investing.",
      url: "https://www.hedgefun.fun/articles",
      publisher: {
        "@type": "Organization",
        name: "HedgeFun",
        url: "https://www.hedgefun.fun",
      },
    },
  });

  return (
    <div className="max-w-[960px] mx-auto px-4 py-10">
      <div className="text-center mb-10">
        <h1 className="text-[1.75rem] md:text-[2rem] font-bold text-foreground mb-2">
          HedgeFun Blog
        </h1>
        <p className="text-muted-foreground text-[0.9375rem]">
          Latest articles on stocks, finance, and investing.
        </p>
      </div>

      <div className="mb-8 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            placeholder="Search articles…"
            className="w-full pl-9 pr-4 py-2 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent-blue/40"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => updateTag(null)}
            className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
              !activeTag
                ? "bg-accent-blue text-white border-accent-blue"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {ALL_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => updateTag(activeTag === tag ? null : tag)}
              className={`text-xs font-medium px-3 py-1 rounded-full border transition-colors ${
                activeTag === tag
                  ? "bg-accent-blue text-white border-accent-blue"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
        {paginatedArticles.map((article) => (
          <button
            key={article.slug}
            onClick={() => handleArticleClick(article)}
            className="text-left border border-border rounded-md overflow-hidden hover:border-accent-blue transition-colors group bg-surface-card"
          >
            <div
              className="aspect-video overflow-hidden"
              style={{ backgroundColor: "#f4f4f5" }}
            >
              <img
                src={article.image}
                alt={article.title}
                width={400}
                height={225}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            </div>

            <div className="p-4">
              <h2 className="text-[0.9375rem] font-bold text-foreground leading-snug mb-2 group-hover:text-accent-blue transition-colors line-clamp-2">
                {article.title}
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-4">
                {article.excerpt}
              </p>

              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-accent-blue flex items-center justify-center shrink-0">
                  <span className="text-[0.5rem] font-bold text-primary-foreground">
                    HF
                  </span>
                </div>
                <div>
                  <p className="text-xs font-medium text-accent-blue leading-none">
                    {article.author ?? "HedgeFun Team"}
                  </p>
                  <p className="text-[0.625rem] text-muted-foreground mt-0.5">
                    {article.date}
                  </p>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {page * ARTICLES_PER_PAGE < filtered.length && (
        <div className="flex justify-center">
          <button
            onClick={() => setPage((p) => p + 1)}
            className="px-6 py-2 rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}
