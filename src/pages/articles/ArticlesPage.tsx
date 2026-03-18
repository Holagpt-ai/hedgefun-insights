import { useNavigate } from "react-router-dom";
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
}

/* ── Seed Data ──────────────────────────────────── */
export const ARTICLES: Article[] = [
  {
    slug: "starlink-ipo-what-investors-need-to-know",
    title: "Starlink IPO: What Investors Need to Know Before It Goes Public",
    excerpt:
      "SpaceX's Starlink division is one of the most anticipated IPOs in years. Here's what the financials look like and how to position before it launches.",
    date: "Jan 15, 2026",
    image: starlinkImg,
  },
  {
    slug: "rising-oil-prices-whats-driving-the-surge",
    title: "Rising Oil Prices: What's Driving the Surge and Who Benefits",
    excerpt:
      "Crude oil has been climbing steadily. We break down the macro forces at play and the energy stocks best positioned to capitalize.",
    date: "Feb 3, 2026",
    image: oilImg,
  },
  {
    slug: "the-perfect-retracement-setup-a-trade-breakdown",
    title: "The Perfect Retracement Setup: A Trade Breakdown",
    excerpt:
      "One of the cleanest technical setups in trading is the Fibonacci retracement. Here's a real example with entry, stop, and target levels.",
    date: "Feb 18, 2026",
    image: fiboImg,
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

export default function ArticlesPage() {
  const navigate = useNavigate();

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

      {/* Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
        {ARTICLES.map((article) => (
          <button
            key={article.slug}
            onClick={() => navigate(`/articles/${article.slug}`)}
            className="text-left border border-border rounded-md overflow-hidden hover:border-accent-blue transition-colors group bg-surface-card"
          >
            {/* Cover image */}
            <div className="h-[160px] overflow-hidden">
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
                    HedgeFun Team
                  </p>
                  <p className="text-[0.625rem] text-muted-foreground mt-0.5">{article.date}</p>
                </div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Pagination */}
      <div className="flex justify-end">
        <button className="text-sm text-accent-blue hover:underline font-medium">
          Next →
        </button>
      </div>
    </div>
  );
}
