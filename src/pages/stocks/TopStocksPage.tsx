import { useState } from "react";
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
  { rank: 1, symbol: "PLTR", name: "Palantir Technologies Inc.", analysts: 10, pt: 35.50, upside: 52.14, marketCap: "78.2B" },
  { rank: 2, symbol: "SMCI", name: "Super Micro Computer, Inc.", analysts: 9, pt: 48.00, upside: 49.88, marketCap: "22.1B" },
  { rank: 3, symbol: "CRWD", name: "CrowdStrike Holdings, Inc.", analysts: 12, pt: 420.00, upside: 47.33, marketCap: "72.5B" },
  { rank: 4, symbol: "ANET", name: "Arista Networks, Inc.", analysts: 11, pt: 340.00, upside: 45.12, marketCap: "108.3B" },
  { rank: 5, symbol: "NOW", name: "ServiceNow, Inc.", analysts: 14, pt: 950.00, upside: 43.88, marketCap: "185.7B" },
  { rank: 6, symbol: "PANW", name: "Palo Alto Networks, Inc.", analysts: 13, pt: 380.00, upside: 42.55, marketCap: "120.4B" },
  { rank: 7, symbol: "SNOW", name: "Snowflake Inc.", analysts: 10, pt: 220.00, upside: 41.22, marketCap: "52.8B" },
  { rank: 8, symbol: "DDOG", name: "Datadog, Inc.", analysts: 11, pt: 165.00, upside: 40.11, marketCap: "55.3B" },
  { rank: 9, symbol: "UBER", name: "Uber Technologies, Inc.", analysts: 15, pt: 88.00, upside: 39.44, marketCap: "178.9B" },
  { rank: 10, symbol: "TTD", name: "The Trade Desk, Inc.", analysts: 9, pt: 115.00, upside: 38.77, marketCap: "56.1B" },
  { rank: 11, symbol: "MELI", name: "MercadoLibre, Inc.", analysts: 10, pt: 2200.00, upside: 37.88, marketCap: "95.4B" },
  { rank: 12, symbol: "LLY", name: "Eli Lilly and Company", analysts: 16, pt: 980.00, upside: 36.55, marketCap: "720.1B" },
  { rank: 13, symbol: "AVGO", name: "Broadcom Inc.", analysts: 14, pt: 245.00, upside: 35.22, marketCap: "890.2B" },
  { rank: 14, symbol: "NFLX", name: "Netflix, Inc.", analysts: 13, pt: 1120.00, upside: 34.88, marketCap: "409.3B" },
  { rank: 15, symbol: "COST", name: "Costco Wholesale Corporation", analysts: 12, pt: 1050.00, upside: 33.44, marketCap: "410.5B" },
  { rank: 16, symbol: "ISRG", name: "Intuitive Surgical, Inc.", analysts: 10, pt: 580.00, upside: 32.77, marketCap: "178.2B" },
  { rank: 17, symbol: "V", name: "Visa Inc.", analysts: 14, pt: 340.00, upside: 31.55, marketCap: "580.3B" },
  { rank: 18, symbol: "MA", name: "Mastercard Incorporated", analysts: 13, pt: 570.00, upside: 30.88, marketCap: "455.7B" },
  { rank: 19, symbol: "ABBV", name: "AbbVie Inc.", analysts: 11, pt: 225.00, upside: 30.22, marketCap: "310.4B" },
  { rank: 20, symbol: "CRM", name: "Salesforce, Inc.", analysts: 15, pt: 380.00, upside: 29.55, marketCap: "295.1B" },
  { rank: 21, symbol: "ADBE", name: "Adobe Inc.", analysts: 12, pt: 620.00, upside: 29.11, marketCap: "245.8B" },
  { rank: 22, symbol: "AMD", name: "Advanced Micro Devices, Inc.", analysts: 14, pt: 210.00, upside: 28.44, marketCap: "265.3B" },
  { rank: 23, symbol: "INTU", name: "Intuit Inc.", analysts: 10, pt: 750.00, upside: 27.88, marketCap: "195.6B" },
  { rank: 24, symbol: "TXN", name: "Texas Instruments Incorporated", analysts: 11, pt: 220.00, upside: 27.22, marketCap: "185.4B" },
  { rank: 25, symbol: "LRCX", name: "Lam Research Corporation", analysts: 9, pt: 110.00, upside: 26.55, marketCap: "128.7B" },
  { rank: 26, symbol: "VMC", name: "Vulcan Materials Company", analysts: 9, pt: 327.78, upside: 26.11, marketCap: "35.5B" },
  { rank: 27, symbol: "KLAC", name: "KLA Corporation", analysts: 10, pt: 850.00, upside: 25.88, marketCap: "105.2B" },
  { rank: 28, symbol: "WDAY", name: "Workday, Inc.", analysts: 12, pt: 310.00, upside: 25.44, marketCap: "72.8B" },
  { rank: 29, symbol: "WULF", name: "TeraWulf Inc.", analysts: 9, pt: 18.00, upside: 25.11, marketCap: "6.0B" },
  { rank: 30, symbol: "TEL", name: "TE Connectivity plc", analysts: 9, pt: 257.00, upside: 24.77, marketCap: "59.5B" },
  { rank: 31, symbol: "GEV", name: "GE Vernova Inc.", analysts: 11, pt: 420.00, upside: 24.33, marketCap: "85.3B" },
  { rank: 32, symbol: "FTNT", name: "Fortinet, Inc.", analysts: 10, pt: 110.00, upside: 23.88, marketCap: "68.9B" },
  { rank: 33, symbol: "CDNS", name: "Cadence Design Systems, Inc.", analysts: 9, pt: 340.00, upside: 23.55, marketCap: "82.1B" },
  { rank: 34, symbol: "SNPS", name: "Synopsys, Inc.", analysts: 10, pt: 620.00, upside: 23.22, marketCap: "88.4B" },
  { rank: 35, symbol: "SSB", name: "SouthState Bank Corporation", analysts: 9, pt: 119.00, upside: 22.88, marketCap: "9.1B" },
  { rank: 36, symbol: "RL", name: "Ralph Lauren Corporation", analysts: 8, pt: 426.57, upside: 22.44, marketCap: "20.9B" },
  { rank: 37, symbol: "WTFC", name: "Wintrust Financial Corporation", analysts: 8, pt: 165.38, upside: 22.11, marketCap: "9.1B" },
  { rank: 38, symbol: "VEEV", name: "Veeva Systems Inc.", analysts: 10, pt: 270.00, upside: 21.88, marketCap: "38.5B" },
  { rank: 39, symbol: "ZS", name: "Zscaler, Inc.", analysts: 11, pt: 260.00, upside: 21.55, marketCap: "32.7B" },
  { rank: 40, symbol: "TEAM", name: "Atlassian Corporation", analysts: 9, pt: 310.00, upside: 21.22, marketCap: "65.8B" },
  { rank: 41, symbol: "MNDY", name: "monday.com Ltd.", analysts: 8, pt: 380.00, upside: 20.88, marketCap: "18.9B" },
  { rank: 42, symbol: "NET", name: "Cloudflare, Inc.", analysts: 10, pt: 130.00, upside: 20.55, marketCap: "42.3B" },
  { rank: 43, symbol: "HUBS", name: "HubSpot, Inc.", analysts: 11, pt: 750.00, upside: 20.22, marketCap: "35.1B" },
  { rank: 44, symbol: "DASH", name: "DoorDash, Inc.", analysts: 12, pt: 200.00, upside: 19.88, marketCap: "78.4B" },
  { rank: 45, symbol: "COIN", name: "Coinbase Global, Inc.", analysts: 9, pt: 310.00, upside: 19.55, marketCap: "62.7B" },
  { rank: 46, symbol: "ABNB", name: "Airbnb, Inc.", analysts: 13, pt: 175.00, upside: 19.22, marketCap: "92.1B" },
  { rank: 47, symbol: "SHOP", name: "Shopify Inc.", analysts: 12, pt: 115.00, upside: 18.88, marketCap: "135.6B" },
  { rank: 48, symbol: "SQ", name: "Block, Inc.", analysts: 11, pt: 95.00, upside: 18.55, marketCap: "48.3B" },
  { rank: 49, symbol: "MRVL", name: "Marvell Technology, Inc.", analysts: 10, pt: 105.00, upside: 18.22, marketCap: "72.9B" },
  { rank: 50, symbol: "MU", name: "Micron Technology, Inc.", analysts: 14, pt: 135.00, upside: 17.88, marketCap: "118.5B" },
];

const RANKING_FACTORS = [
  { icon: CheckCircle, title: "Success Rate", desc: "The percentage of ratings that are profitable." },
  { icon: BarChart3, title: "Average Return", desc: "The average percentage return within one year of the rating." },
  { icon: Hash, title: "Rating Count", desc: "The more ratings the analyst has provided, the higher the score." },
  { icon: Clock, title: "Recency", desc: "Ratings provided within the past year contribute to a higher score." },
];

const PAGE_SIZE = 25;

export default function TopStocksPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(TOP_STOCKS.length / PAGE_SIZE);
  const pageStocks = TOP_STOCKS.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

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
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground shrink-0" onClick={() => navigate("/pro")}>
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
        <div className="mb-4">
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
                {pageStocks.map((s) => (
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
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mb-8">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="text-xs gap-1">
              ← Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page + 1} of {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} className="text-xs gap-1">
              Next →
            </Button>
          </div>
        )}

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
    </div>
  );
}
