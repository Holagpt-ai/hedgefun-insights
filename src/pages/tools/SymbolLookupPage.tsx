import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const SEED_DATA: { symbol: string; name: string; type: "Stock" | "ETF" }[] = [
  { symbol: "AAPL", name: "Apple Inc.", type: "Stock" },
  { symbol: "MSFT", name: "Microsoft Corporation", type: "Stock" },
  { symbol: "NVDA", name: "NVIDIA Corporation", type: "Stock" },
  { symbol: "GOOGL", name: "Alphabet Inc.", type: "Stock" },
  { symbol: "AMZN", name: "Amazon.com Inc.", type: "Stock" },
  { symbol: "META", name: "Meta Platforms Inc.", type: "Stock" },
  { symbol: "TSLA", name: "Tesla Inc.", type: "Stock" },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", type: "Stock" },
  { symbol: "V", name: "Visa Inc.", type: "Stock" },
  { symbol: "JNJ", name: "Johnson & Johnson", type: "Stock" },
  { symbol: "WMT", name: "Walmart Inc.", type: "Stock" },
  { symbol: "BAC", name: "Bank of America Corporation", type: "Stock" },
  { symbol: "XOM", name: "Exxon Mobil Corporation", type: "Stock" },
  { symbol: "COST", name: "Costco Wholesale Corporation", type: "Stock" },
  { symbol: "HD", name: "The Home Depot Inc.", type: "Stock" },
  { symbol: "PG", name: "Procter & Gamble Co.", type: "Stock" },
  { symbol: "KO", name: "The Coca-Cola Company", type: "Stock" },
  { symbol: "PEP", name: "PepsiCo Inc.", type: "Stock" },
  { symbol: "MCD", name: "McDonald's Corporation", type: "Stock" },
  { symbol: "NFLX", name: "Netflix Inc.", type: "Stock" },
  { symbol: "AMD", name: "Advanced Micro Devices Inc.", type: "Stock" },
  { symbol: "INTC", name: "Intel Corporation", type: "Stock" },
  { symbol: "DIS", name: "The Walt Disney Company", type: "Stock" },
  { symbol: "CSCO", name: "Cisco Systems Inc.", type: "Stock" },
  { symbol: "ORCL", name: "Oracle Corporation", type: "Stock" },
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", type: "ETF" },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", type: "ETF" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", type: "ETF" },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", type: "ETF" },
  { symbol: "IVV", name: "iShares Core S&P 500 ETF", type: "ETF" },
  { symbol: "BND", name: "Vanguard Total Bond Market ETF", type: "ETF" },
  { symbol: "GLD", name: "SPDR Gold Shares", type: "ETF" },
  { symbol: "SLV", name: "iShares Silver Trust", type: "ETF" },
  { symbol: "ARKK", name: "ARK Innovation ETF", type: "ETF" },
  { symbol: "IEMG", name: "iShares Core MSCI Emerging Markets ETF", type: "ETF" },
  { symbol: "AGG", name: "iShares Core U.S. Aggregate Bond ETF", type: "ETF" },
];

export default function SymbolLookupPage() {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SEED_DATA;
    return SEED_DATA.filter(
      (item) =>
        item.symbol.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Ad slot */}
      <div
        className="ad-slot-leaderboard w-full bg-surface border border-border rounded flex items-center justify-center mb-6"
        style={{ minHeight: "90px" }}
        aria-label="Advertisement"
      >
        <span className="text-xs text-muted-foreground">Advertisement</span>
      </div>

      <Breadcrumb className="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link to="/">Home</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild><Link to="/tools">Tools</Link></BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Symbol Lookup</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-[1.375rem] font-bold text-foreground mb-1">Symbol Lookup</h1>
      <div className="h-[3px] bg-primary w-full mb-3" />
      <p className="text-sm text-muted-foreground mb-6">
        Search for a ticker symbol by company name, ETF name, or fund name.
      </p>

      {/* Search input */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by company name, e.g. Apple, Vanguard, iShares..."
          className="pl-9 h-11"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Results */}
      <Card className="fintech-card">
        <CardContent className="p-0">
          {results.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="table-header px-4 py-2.5 text-left">Symbol</th>
                  <th className="table-header px-4 py-2.5 text-left">Name</th>
                  <th className="table-header px-4 py-2.5 text-left">Type</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item) => (
                  <tr
                    key={item.symbol}
                    className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/stocks/${item.symbol}`)}
                  >
                    <td className="table-cell px-4 py-2.5 font-semibold text-primary">
                      {item.symbol}
                    </td>
                    <td className="table-cell px-4 py-2.5 text-foreground">{item.name}</td>
                    <td className="table-cell px-4 py-2.5">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded ${
                          item.type === "ETF"
                            ? "bg-accent/50 text-accent-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {item.type}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results found for '{query}'. Try a different name or ticker.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
