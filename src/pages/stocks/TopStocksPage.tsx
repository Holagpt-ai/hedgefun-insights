import { useNavigate } from "react-router-dom";
import { Lock, Info, CheckCircle, BarChart3, Hash, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { tickerToSlug } from "@/lib/ticker-utils";


const TOP_STOCKS = [
  { rank: 50, symbol: "VMC", name: "Vulcan Materials Company", analysts: 9, pt: 327.78, upside: 20.51, marketCap: "35.5B" },
  { rank: 49, symbol: "WTFC", name: "Wintrust Financial Corporation", analysts: 8, pt: 165.38, upside: 21.05, marketCap: "9.1B" },
  { rank: 48, symbol: "RL", name: "Ralph Lauren Corporation", analysts: 8, pt: 426.57, upside: 23.23, marketCap: "20.9B" },
  { rank: 47, symbol: "NFLX", name: "Netflix, Inc.", analysts: 13, pt: 120.38, upside: 24.18, marketCap: "409.3B" },
  { rank: 46, symbol: "WULF", name: "TeraWulf Inc.", analysts: 9, pt: 18.00, upside: 25.44, marketCap: "6.0B" },
  { rank: 45, symbol: "TEL", name: "TE Connectivity plc", analysts: 9, pt: 257.00, upside: 26.63, marketCap: "59.5B" },
  { rank: 44, symbol: "SSB", name: "SouthState Bank Corporation", analysts: 9, pt: 119.00, upside: 27.19, marketCap: "9.1B" },
  { rank: 43, symbol: "AVGO", name: "Broadcom Inc.", analysts: 14, pt: 245.00, upside: 28.12, marketCap: "890.2B" },
];

const RANKING_FACTORS = [
  { icon: CheckCircle, title: "Success Rate", desc: "The percentage of ratings that are profitable." },
  { icon: BarChart3, title: "Average Return", desc: "The average percentage return within one year of the rating." },
  { icon: Hash, title: "Rating Count", desc: "The more ratings the analyst has provided, the higher the score." },
  { icon: Clock, title: "Recency", desc: "Ratings provided within the past year contribute to a higher score." },
];

export default function TopStocksPage() {
  const navigate = useNavigate();

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/" className="text-[0.8125rem]">Home</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/stocks/analysts" className="text-[0.8125rem]">Analysts</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage className="text-[0.8125rem]">Top Stocks</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-[1.375rem] font-bold text-foreground">Top 50 Strong Buy Stocks</h1>
            <p className="text-sm text-muted-foreground">The top 50 "Strong Buy" stocks according to the best performing Wall Street analysts.</p>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground shrink-0">
            Full Width <Lock className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Info banner */}
        <div className="bg-accent-blue-light border-l-4 border-l-primary rounded-[var(--radius)] px-4 py-3 mb-6 flex gap-3 items-start">
          <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <p className="text-sm text-foreground">
            Strong Buy stocks according to stock analysts with a star rating of 4 or higher. These analysts have much higher accuracy and returns than average. Stocks are sorted by upside potential. Only stocks rated by 8 or more top-performing analysts are included.
          </p>
        </div>

        {/* Table header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-foreground">Top Stocks</h2>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm">Indicators</Button></DropdownMenuTrigger>
              <DropdownMenuContent><DropdownMenuItem>Default</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm">Download</Button></DropdownMenuTrigger>
              <DropdownMenuContent><DropdownMenuItem>CSV</DropdownMenuItem><DropdownMenuItem>Excel</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="icon" className="h-9 w-9 text-muted-foreground">⋮</Button>
          </div>
        </div>

        {/* Table */}
        <div className="relative mb-8">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-border">
                  {["No.", "Symbol", "Company Name", "Top Rating", "Top Analysts", "Top PT", "Top PT Upside (%)", "Market Cap"].map((h, i) => (
                    <th key={h} className={`py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground ${i === 0 || i >= 4 ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TOP_STOCKS.slice(0, 6).map((s) => (
                  <tr key={s.rank} className="border-b border-border hover:bg-surface transition-colors">
                    <td className="py-3 px-3 text-right text-[0.875rem] text-muted-foreground tabular-nums">{s.rank}</td>
                    <td className="py-3 px-3">
                      <button onClick={() => navigate(`/stocks/${tickerToSlug(s.symbol)}`)} className="text-primary font-semibold hover:underline text-[0.875rem]">{s.symbol}</button>
                    </td>
                    <td className="py-3 px-3 text-[0.875rem] text-foreground">{s.name}</td>
                    <td className="py-3 px-3">
                      <span className="inline-block text-[0.75rem] px-1.5 py-0.5 rounded font-medium bg-green-bg text-green">Strong Buy</span>
                    </td>
                    <td className="py-3 px-3 text-right text-[0.875rem] tabular-nums">{s.analysts}</td>
                    <td className="py-3 px-3 text-right text-[0.875rem] tabular-nums">{s.pt.toFixed(2)}</td>
                    <td className="py-3 px-3 text-right text-[0.875rem] tabular-nums text-green font-medium">{s.upside.toFixed(2)}%</td>
                    <td className="py-3 px-3 text-right text-[0.875rem] tabular-nums">{s.marketCap}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paywall */}
          <div className="relative -mt-8">
            <div className="h-16 bg-gradient-to-t from-background to-transparent" />
            <div className="border border-border rounded-[var(--radius)] p-8 text-center bg-background">
              <h2 className="text-[1.375rem] font-bold text-foreground mb-2">Upgrade to Pro</h2>
              <p className="text-sm text-muted-foreground mb-4">Get stock forecasts from Wall Street's highest rated professionals</p>
              <p className="text-sm font-bold text-foreground mb-4">Get much more with HedgeFun Pro</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 max-w-lg mx-auto mb-6 text-left">
                {["Investment ideas from the top Wall Street analysts", "Advanced analyst filtering and sorting options", "Unlimited access to all data and tools", "Up to 30 years financial history"].map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm text-foreground"><span className="mt-1 text-xs">•</span><span>{item}</span></div>
                ))}
              </div>
              <Button onClick={() => navigate("/pro")} className="bg-primary text-primary-foreground hover:bg-primary/90 px-8">Sign Up Today</Button>
            </div>
          </div>
        </div>

        {/* Analyst Star Rankings */}
        <div className="text-center mb-8">
          <h2 className="text-[1.375rem] font-bold text-foreground mb-2">Analyst Star Rankings</h2>
          <p className="text-sm text-muted-foreground mb-6">Our analyst star rankings are based on these four factors</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {RANKING_FACTORS.map((f) => (
              <div key={f.title} className="border border-border rounded-[var(--radius)] p-4 text-left">
                <div className="h-10 w-10 rounded-full bg-accent-blue-light flex items-center justify-center mb-3">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1">{f.title}</h3>
                <p className="text-[0.8125rem] text-muted-foreground">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
