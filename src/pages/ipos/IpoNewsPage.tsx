import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { IpoTabBar } from "@/components/ipos/IpoTabBar";
import { AdBanner } from "@/components/layout/AdBanner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";

/* ── Fallback seed data ────────────────────────── */
const SEED_NEWS = [
  { id: "1", headline: "Nextera Robotics prices IPO at $22, above expected range of $18–$20", source: "Reuters", published_at: "2026-03-11T14:30:00Z", url: "#", isVideo: false, excerpt: "The autonomous logistics company raised $1.1B in its debut on the NASDAQ exchange." },
  { id: "2", headline: "Record Q1 2026 IPO pipeline signals renewed market confidence", source: "Bloomberg", published_at: "2026-03-11T11:00:00Z", url: "#", isVideo: false, excerpt: "Over 45 companies have filed S-1 paperwork since January, the highest pace since 2021." },
  { id: "3", headline: "Verdant Energy postpones listing amid oil price volatility", source: "CNBC", published_at: "2026-03-11T08:15:00Z", url: "#", isVideo: true, excerpt: "The renewable energy firm cited macro headwinds for delaying its NYSE debut." },
  { id: "4", headline: "SPAC mergers decline 40% year-over-year as traditional IPOs surge", source: "Wall Street Journal", published_at: "2026-03-10T19:00:00Z", url: "#", isVideo: false, excerpt: "Investors increasingly prefer conventional offerings over blank-check companies." },
  { id: "5", headline: "Athena AI sets terms for $1.2B IPO next week on NASDAQ", source: "MarketWatch", published_at: "2026-03-10T16:30:00Z", url: "#", isVideo: false, excerpt: "The enterprise AI platform is targeting a valuation above $8 billion." },
  { id: "6", headline: "ServiceTitan stock surges 42% in first day of trading", source: "TechCrunch", published_at: "2026-03-10T14:00:00Z", url: "#", isVideo: true, excerpt: "The field service management software company priced its IPO at $71 per share." },
  { id: "7", headline: "Private equity firms rush portfolio companies toward Q2 listings", source: "Financial Times", published_at: "2026-03-10T10:45:00Z", url: "#", isVideo: false, excerpt: "KKR, Blackstone and Apollo are each preparing at least two IPO candidates." },
  { id: "8", headline: "Fanatics sports betting unit considered for separate IPO", source: "Bloomberg", published_at: "2026-03-09T22:00:00Z", url: "#", isVideo: false, excerpt: "The company is exploring a spin-off of its online gambling division." },
  { id: "9", headline: "Databricks sets sights on IPO as AI revenue doubles to $2.4B", source: "Reuters", published_at: "2026-03-09T18:30:00Z", url: "#", isVideo: false, excerpt: "The data analytics giant could debut at a $60B+ valuation later this year." },
  { id: "10", headline: "Chinese IPOs in the US face new regulatory scrutiny from SEC", source: "CNBC", published_at: "2026-03-09T15:00:00Z", url: "#", isVideo: true, excerpt: "New disclosure requirements could slow the pipeline of Chinese listings." },
  { id: "11", headline: "StockX exploring IPO after shelving 2022 plans due to market downturn", source: "Wall Street Journal", published_at: "2026-03-09T12:00:00Z", url: "#", isVideo: false, excerpt: "The sneaker marketplace has seen revenue growth stabilize at 18% YoY." },
  { id: "12", headline: "Stripe reportedly reconsidering direct listing for late 2026", source: "The Information", published_at: "2026-03-08T20:00:00Z", url: "#", isVideo: false, excerpt: "The payments giant last raised at a $65B valuation in a 2023 funding round." },
  { id: "13", headline: "Medline Industries adds banks for potential $50B IPO", source: "Reuters", published_at: "2026-03-08T16:45:00Z", url: "#", isVideo: false, excerpt: "Goldman Sachs and JPMorgan join Morgan Stanley as lead underwriters." },
  { id: "14", headline: "How the IPO market is adapting to higher interest rates", source: "Barron's", published_at: "2026-03-08T13:00:00Z", url: "#", isVideo: true, excerpt: "Companies are adjusting valuation expectations as the Fed holds rates steady." },
  { id: "15", headline: "Impossible Foods preparing for IPO amid plant-based market rebound", source: "Bloomberg", published_at: "2026-03-08T09:30:00Z", url: "#", isVideo: false, excerpt: "The company has been profitable for two consecutive quarters." },
  { id: "16", headline: "CoreWeave files for IPO as AI infrastructure demand soars", source: "TechCrunch", published_at: "2026-03-07T21:00:00Z", url: "#", isVideo: false, excerpt: "The GPU cloud provider reported $1.9B in revenue for fiscal 2025." },
  { id: "17", headline: "European biotech IPOs outpace US counterparts in Q1", source: "Financial Times", published_at: "2026-03-07T17:30:00Z", url: "#", isVideo: false, excerpt: "London and Amsterdam exchanges attract more life sciences listings." },
  { id: "18", headline: "Plaid technologies weighing IPO options for second half of 2026", source: "Wall Street Journal", published_at: "2026-03-07T14:00:00Z", url: "#", isVideo: false, excerpt: "The fintech infrastructure company last valued at $13.4B." },
  { id: "19", headline: "Reddit reports strong first full-year results ahead of lockup expiry", source: "MarketWatch", published_at: "2026-03-07T10:00:00Z", url: "#", isVideo: true, excerpt: "Revenue grew 54% YoY as advertising business matures." },
  { id: "20", headline: "SEC proposes new rules for IPO pricing transparency", source: "Reuters", published_at: "2026-03-06T20:15:00Z", url: "#", isVideo: false, excerpt: "The proposed rules would require more detailed allocation disclosures." },
];

const SIDEBAR_NEWS = [
  { time: "2h ago", headline: "Cantor Fitzgerald IPO plans gain momentum" },
  { time: "4h ago", headline: "European tech IPOs surge as VC seeks exits" },
  { time: "6h ago", headline: "Klarna refiles IPO prospectus with higher revenue" },
  { time: "8h ago", headline: "Shein delays US IPO amid regulatory concerns" },
  { time: "12h ago", headline: "Discord exploring dual-track IPO and sale process" },
  { time: "1d ago", headline: "Cerebras Systems IPO filing reveals $1B revenue" },
  { time: "1d ago", headline: "Chime Financial targets $40B IPO valuation" },
  { time: "2d ago", headline: "Instacart lockup expiry triggers 8% share drop" },
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function IpoNewsPage() {
  const [visibleCount, setVisibleCount] = useState(20);

  // Try to fetch from DB, fall back to seed
  const { data: dbNews } = useQuery({
    queryKey: ["ipo-news"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_news")
        .select("*")
        .eq("category", "ipo")
        .order("published_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data;
    },
  });

  const newsItems = (dbNews && dbNews.length > 0)
    ? dbNews.map((n, i) => ({
        id: n.id,
        headline: n.headline,
        source: n.source ?? "HedgeFun",
        published_at: n.published_at ?? new Date().toISOString(),
        url: n.url ?? "#",
        isVideo: false,
        excerpt: "",
      }))
    : SEED_NEWS;

  const visible = newsItems.slice(0, visibleCount);

  return (
    <div>
      <IpoTabBar />
      <div className="p-4">
        <Breadcrumb className="mb-3">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/">Home</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/ipos/recent">IPOs</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage>News</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Main feed */}
          <div className="flex-1 min-w-0">
            {visible.map((item) => (
              <div key={item.id} className="flex gap-4 py-4 border-b border-border-subtle">
                {/* Thumbnail */}
                <div className="w-[120px] h-[80px] shrink-0 rounded-md overflow-hidden bg-surface relative">
                  {item.isVideo ? (
                    <div className="w-full h-full bg-foreground/90 flex items-center justify-center">
                      <Play className="h-8 w-8 text-primary-foreground fill-primary-foreground" />
                    </div>
                  ) : (
                    <div className="w-full h-full bg-muted" />
                  )}
                </div>
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[0.9375rem] font-semibold text-accent-blue hover:underline leading-snug line-clamp-2"
                  >
                    {item.headline}
                  </a>
                  <div className="text-[0.8125rem] text-muted-foreground mt-1">
                    {item.source} · {timeAgo(item.published_at)}
                  </div>
                  {item.excerpt && (
                    <p className="text-sm text-text-secondary mt-1 line-clamp-1">{item.excerpt}</p>
                  )}
                </div>
              </div>
            ))}

            {visibleCount < newsItems.length && (
              <div className="py-6 text-center">
                <Button variant="outline" onClick={() => setVisibleCount((c) => c + 20)}>
                  Load More
                </Button>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="w-full md:w-[300px] shrink-0 space-y-4">
            <div className="border border-border rounded-lg overflow-hidden" style={{ minHeight: 250 }}>
              <AdBanner />
            </div>

            <div className="border border-border rounded-lg p-4">
              <h2 className="text-base font-bold text-foreground mb-3">More IPO News</h2>
              {SIDEBAR_NEWS.map((news, i) => (
                <div key={i} className={cn("py-2.5", i < SIDEBAR_NEWS.length - 1 && "border-b border-border-subtle")}>
                  <div className="text-xs text-muted-foreground mb-0.5">{news.time}</div>
                  <button className="text-sm text-accent-blue hover:underline text-left leading-snug">{news.headline}</button>
                </div>
              ))}
            </div>

            <div className="border border-border rounded-lg overflow-hidden" style={{ minHeight: 250 }}>
              <AdBanner />
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
