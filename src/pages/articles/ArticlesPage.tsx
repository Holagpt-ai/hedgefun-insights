import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { usePageSeo } from "@/hooks/usePageSeo";

import starlinkImg from "@/assets/articles/starlink-ipo.jpg";
import oilImg from "@/assets/articles/rising-oil-prices.jpg";
import fiboImg from "@/assets/articles/fibonacci-retracement.jpg";
import aiImg from "@/assets/articles/ai-infrastructure.jpg";
import energyImg from "@/assets/articles/energy-stocks-grid.jpg";

/* ── Types ──────────────────────────────────────── */
export interface Article {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  image: string;
  author?: string;
  tags?: string[];
}

/* ── Seed Data ──────────────────────────────────── */
export const ARTICLES: Article[] = [
  // ── New articles (March 25 2026) ──
  {
    slug: "jensen-huang-agi-achieved",
    title: "Jensen Huang Says AGI Has Been Achieved — What It Means for Nvidia and the Market",
    excerpt: "Nvidia's CEO made a bold claim about artificial general intelligence. Here's what it means for NVDA stock, the semiconductor industry, and investors.",
    date: "Mar 25, 2026",
    image: "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?w=1200&q=80",
    author: "HedgeFun Editorial Team",
    tags: ["Tech", "Analysis"],
  },
  {
    slug: "china-manus-meta-deal-review",
    title: "China Reviews Manus-Meta Deal: All Founders Barred From Leaving the Country",
    excerpt: "Beijing has placed travel restrictions on Manus founders amid its regulatory review of the Meta acquisition deal. What this means for US-China tech relations.",
    date: "Mar 25, 2026",
    image: "https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=1200&q=80",
    author: "HedgeFun Editorial Team",
    tags: ["Markets", "Tech"],
  },
  {
    slug: "oil-prices-fall-iran-ceasefire",
    title: "Oil Prices Fall on Reports of U.S. Ceasefire Proposal With Iran — Will Oil Hit $200?",
    excerpt: "Crude oil dropped sharply on ceasefire reports. We analyze whether $200 oil is realistic and which energy stocks are most affected.",
    date: "Mar 25, 2026",
    image: "https://images.unsplash.com/photo-1513828583688-c52646db42da?w=1200&q=80",
    author: "HedgeFun Editorial Team",
    tags: ["Energy", "Markets"],
  },
  {
    slug: "500-million-oil-bet-trump-statement",
    title: "$500 Million Oil Trade Made Minutes Before Trump's Iran Energy Strike Statement",
    excerpt: "A massive oil options trade placed just before a presidential announcement has drawn SEC scrutiny and market manipulation concerns.",
    date: "Mar 25, 2026",
    image: "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&q=80",
    author: "HedgeFun Editorial Team",
    tags: ["Energy", "Markets"],
  },
  {
    slug: "market-volatility-tariff-uncertainty-2026",
    title: "Market Volatility Surges as Tariff Uncertainty Keeps Investors on Edge in 2026",
    excerpt: "The VIX is elevated and S&P 500 swings are widening. We break down what's driving 2026 market volatility and how to position your portfolio.",
    date: "Mar 25, 2026",
    image: "https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?w=1200&q=80",
    author: "HedgeFun Editorial Team",
    tags: ["Markets", "Analysis"],
  },
  // ── Original articles ──
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
  },
  {
    slug: "energy-stocks-to-watch-as-the-grid-demands-more-power",
    title: "Energy Stocks to Watch as the Grid Demands More Power",
    excerpt:
      "The AI boom is driving unprecedented electricity demand. We look at the energy companies best positioned to power the next decade of growth.",
    date: "Mar 10, 2026",
    image: energyImg,
  },
];

export function getReadTime(wordCount: number): string {
  return `${Math.max(1, Math.ceil(wordCount / 200))} min read`;
}

const ARTICLES_PER_PAGE = 6;

// Collect unique tags
const ALL_TAGS = Array.from(
  new Set(ARTICLES.flatMap((a) => a.tags ?? []))
).sort();

export default function ArticlesPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = ARTICLES;
    if (activeTag) {
      result = result.filter((a) => a.tags?.includes(activeTag));
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.excerpt.toLowerCase().includes(q)
      );
    }
    return result;
  }, [search, activeTag]);

  const totalPages = Math.ceil(filtered.length / ARTICLES_PER_PAGE);
  const paginatedArticles = filtered.slice(
    (page - 1) * ARTICLES_PER_PAGE,
    page * ARTICLES_PER_PAGE
  );

  // Reset to page 1 when filters change
  const updateSearch = (v: string) => { setSearch(v); setPage(1); };
  const updateTag = (t: string | null) => { setActiveTag(t); setPage(1); };

  usePageSeo({
    title: "HedgeFun Blog — Latest Articles on Stocks, Finance & Investing",
    description: "Read in-depth articles on stocks, ETFs, IPOs, market analysis, and investing strategies from the HedgeFun team.",
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
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-[1.75rem] md:text-[2rem] font-bold text-foreground mb-2">
          HedgeFun Blog
        </h1>
        <p className="text-muted-foreground text-[0.9375rem]">
          Latest articles on stocks, finance, and investing.
        </p>
      </div>

      {/* Search & Tag Filter */}
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

      {/* Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
        {paginatedArticles.map((article) => (
          <button
            key={article.slug}
            onClick={() => navigate(`/articles/${article.slug}`)}
            className="text-left border border-border rounded-md overflow-hidden hover:border-accent-blue transition-colors group bg-surface-card"
          >
            {/* Cover image */}
            <div className="aspect-video overflow-hidden">
              <img
                src={article.image}
                alt={article.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
            </div>

            {/* Content */}
            <div className="p-4">
              <h2 className="text-[0.9375rem] font-bold text-foreground leading-snug mb-2 group-hover:text-accent-blue transition-colors line-clamp-2">
                {article.title}
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2 mb-4">
                {article.excerpt}
              </p>

              {/* Author row */}
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-accent-blue flex items-center justify-center shrink-0">
                  <span className="text-[0.5rem] font-bold text-primary-foreground">HF</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-accent-blue leading-none">
                    {article.author ?? "HedgeFun Team"}
                  </p>
                  <p className="text-[0.625rem] text-muted-foreground mt-0.5">{article.date}</p>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-sm font-medium text-accent-blue hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
          >
            ← Previous
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`h-8 w-8 rounded text-sm font-medium transition-colors ${
                p === page
                  ? "bg-accent-blue text-white"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {p}
            </button>
          ))}

          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-sm font-medium text-accent-blue hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
