import { useParams, Link, useNavigate } from "react-router-dom";
import { Star, CheckCircle, BarChart3, Hash, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, ReferenceDot } from "recharts";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { Badge } from "@/components/ui/badge";
import { getAnalystBySlug, getStockRatingsForSector, getIndustriesForSector, type StockRating, type RatingAction } from "@/data/analysts";
import { usePageSeo } from "@/hooks/usePageSeo";
import NotFound from "@/pages/NotFound";

function StarRating({ value }: { value: number }) {
  const full = Math.floor(value);
  return (
    <span className="flex items-center gap-0.5 text-amber-500">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className="h-4 w-4" fill={i < full ? "currentColor" : "none"} />
      ))}
      <span className="text-sm text-muted-foreground ml-1.5">({value.toFixed(2)})</span>
    </span>
  );
}

const ACTION_COLORS: Record<RatingAction, { bg: string; text: string }> = {
  Buy: { bg: "bg-green-bg", text: "text-green" },
  Hold: { bg: "bg-muted", text: "text-muted-foreground" },
  Sell: { bg: "bg-red-bg", text: "text-red" },
};

const CHART_DOT_COLORS: Record<RatingAction, string> = {
  Buy: "hsl(var(--green))",
  Hold: "hsl(var(--muted-foreground))",
  Sell: "hsl(var(--red))",
};

function StockRatingCard({ rating }: { rating: StockRating }) {
  const [expanded, setExpanded] = useState(false);
  const upside = ((rating.newTarget - rating.currentPrice) / rating.currentPrice) * 100;
  const chartData = rating.priceHistory.map((p, i) => ({ i, price: p }));

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link to={`/stocks/${rating.ticker.toLowerCase()}`} className="font-bold text-accent-blue hover:underline">
              {rating.ticker}
            </Link>
            <span className="text-sm text-muted-foreground truncate">{rating.company}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-sm">
            <span className="text-muted-foreground">Maintains:</span>
            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${ACTION_COLORS[rating.action].bg} ${ACTION_COLORS[rating.action].text}`}>
              {rating.action}
            </span>
            <span className="text-muted-foreground">|</span>
            <span>Current: <span className="font-semibold">${rating.currentPrice.toFixed(2)}</span></span>
          </div>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-sm">
            <span className="text-muted-foreground">Price Target:</span>
            <span className="text-muted-foreground">${rating.oldTarget}</span>
            <span>→</span>
            <span className="font-bold">${rating.newTarget}</span>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">Upside:</span>
            <span className={upside >= 0 ? "text-green font-semibold" : "text-red font-semibold"}>
              {upside >= 0 ? "+" : ""}{upside.toFixed(2)}%
            </span>
          </div>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">{rating.date}</span>
      </div>

      {/* Toggle */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-center gap-1 py-2 border-t border-border text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <span>{rating.totalRatings} Ratings</span>
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <span>{expanded ? "Hide" : "View All"}</span>
      </button>

      {/* Chart */}
      {expanded && (
        <div className="px-2 pb-3">
          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${rating.ticker}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--accent-blue))" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(var(--accent-blue))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="i" hide />
              <YAxis domain={["dataMin - 5", "dataMax + 5"]} hide />
              <Area
                type="monotone"
                dataKey="price"
                stroke="hsl(var(--accent-blue))"
                strokeWidth={1.5}
                fill={`url(#grad-${rating.ticker})`}
              />
              {rating.ratingPoints.map((rp, idx) => (
                <ReferenceDot
                  key={idx}
                  x={rp.index}
                  y={chartData[rp.index]?.price}
                  r={5}
                  fill={CHART_DOT_COLORS[rp.action]}
                  stroke="white"
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-3 justify-center mt-1">
            {(["Buy", "Hold", "Sell"] as RatingAction[]).map((a) => (
              <span key={a} className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_DOT_COLORS[a] }} />
                {a}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AnalystProfilePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const analyst = getAnalystBySlug(slug ?? "");

  usePageSeo({
    title: analyst ? `${analyst.name} - Stock Analyst | HedgeFun` : "Analyst | HedgeFun",
    description: analyst
      ? `${analyst.name} is a stock analyst at ${analyst.firm}. See ratings, success rate, and average return.`
      : "Analyst profile on HedgeFun.",
  });

  if (!analyst) return <NotFound />;

  const stockRatings = getStockRatingsForSector(analyst.sector);
  const industries = getIndustriesForSector(analyst.sector);
  const initials = analyst.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2);

  return (
    <div className="min-w-0">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/" className="text-[0.8125rem]">Home</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/stocks/analysts" className="text-[0.8125rem]">Analysts</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage className="text-[0.8125rem]">{analyst.name}</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center gap-4 mb-2">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center text-xl font-bold text-muted-foreground shrink-0">
            {initials}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{analyst.name}</h1>
            <p className="text-sm text-muted-foreground">Stock Analyst at {analyst.firm}</p>
            <StarRating value={analyst.rating} />
          </div>
        </div>
        <div className="h-0.5 bg-accent-blue rounded mb-6" />

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="border border-border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-foreground">#{analyst.rank}</p>
            <p className="text-xs text-muted-foreground mt-1">Out of 5,174 analysts</p>
          </div>
          <div className="border border-border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-foreground">{analyst.totalRatings}</p>
            <p className="text-xs text-muted-foreground mt-1">Total Ratings</p>
          </div>
          <div className="border border-border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green">{analyst.successRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">Success Rate</p>
          </div>
          <div className="border border-border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold text-green">{analyst.avgReturn.toFixed(2)}%</p>
            <p className="text-xs text-muted-foreground mt-1">Average Return</p>
          </div>
        </div>

        {/* Sectors & Industries */}
        <div className="border border-border rounded-lg p-5 mb-8">
          <h2 className="font-semibold text-sm mb-3">Sectors & Industries</h2>
          <div className="mb-3">
            <span className="text-xs text-muted-foreground mr-2">Main Sectors:</span>
            <Badge variant="outline" className="border-accent-blue text-accent-blue">{analyst.sector}</Badge>
          </div>
          <div>
            <span className="text-xs text-muted-foreground mr-2">Top Industries:</span>
            <div className="inline-flex flex-wrap gap-1.5 mt-1">
              {industries.map((ind) => (
                <span key={ind} className="text-xs text-accent-blue hover:underline cursor-default">{ind}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Stock Ratings */}
        <h2 className="text-lg font-bold mb-4">Stocks Rated by {analyst.name}</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {stockRatings.map((sr) => (
            <StockRatingCard key={sr.ticker} rating={sr} />
          ))}
        </div>

        {/* Pro upsell */}
        <div className="border border-border rounded-lg p-6 mb-6">
          <h2 className="text-lg font-bold mb-1">Upgrade to Pro</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Get stock forecasts from Wall Street's highest rated professionals
          </p>
          <p className="font-semibold text-sm mb-3">Get much more with HedgeFun Pro</p>
          <ul className="space-y-1.5 text-sm mb-5">
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green shrink-0" />
              Investment ideas from the top Wall Street analysts
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green shrink-0" />
              Advanced analyst filtering and sorting options
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green shrink-0" />
              Unlimited access to all data and tools
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green shrink-0" />
              Up to 30 years financial history
            </li>
          </ul>
          <Button
            onClick={() => navigate("/pro")}
            className="w-full bg-accent-blue hover:bg-accent-blue-hover text-white"
          >
            Sign Up Today
          </Button>
        </div>
      </div>
    </div>
  );
}
