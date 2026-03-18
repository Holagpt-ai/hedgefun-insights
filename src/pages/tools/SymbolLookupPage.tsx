import { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

type StockResult = { symbol: string; name: string; sector: string | null };

export default function SymbolLookupPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [searched, setSearched] = useState(false);
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStocks = async (q: string) => {
    setLoading(true);
    const trimmed = q.trim();
    let query$ = supabase
      .from("stocks")
      .select("symbol, name, sector")
      .order("symbol", { ascending: true })
      .limit(50);

    if (trimmed) {
      query$ = query$.or(
        `symbol.ilike.%${trimmed}%,name.ilike.%${trimmed}%`
      );
    }

    const { data, error } = await query$;
    if (!error && data) {
      setResults(data);
    }
    setLoading(false);
    setSearched(true);
  };

  // Initial load
  useEffect(() => {
    fetchStocks("");
  }, []);

  // Debounced search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchStocks(query);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const getType = (sector: string | null) => {
    if (!sector) return "Stock";
    const s = sector.toLowerCase();
    if (s.includes("etf") || s.includes("fund")) return "ETF";
    return "Stock";
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
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

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by company name, e.g. Apple, Vanguard, iShares..."
          className="pl-9 h-11"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Card className="fintech-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="px-4 py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading...
            </div>
          ) : results.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="table-header px-4 py-2.5 text-left">Symbol</th>
                  <th className="table-header px-4 py-2.5 text-left">Name</th>
                  <th className="table-header px-4 py-2.5 text-left">Type</th>
                </tr>
              </thead>
              <tbody>
                {results.map((item) => {
                  const type = getType(item.sector);
                  return (
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
                            type === "ETF"
                              ? "bg-accent/50 text-accent-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {type}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : searched ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results found for '{query}'. Try a different name or ticker.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
