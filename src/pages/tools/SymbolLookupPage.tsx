import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Search, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

const PAGE_SIZE = 25;

export default function SymbolLookupPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StockResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const navigate = useNavigate();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchStocks = useCallback(async (q: string, p: number) => {
    setLoading(true);
    const trimmed = q.trim();
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query$ = supabase
      .from("stocks")
      .select("symbol, name, sector", { count: "exact" })
      .order("symbol", { ascending: true })
      .range(from, to);

    if (trimmed) {
      query$ = query$.or(
        `symbol.ilike.%${trimmed}%,name.ilike.%${trimmed}%`
      );
    }

    const { data, error, count } = await query$;
    if (!error && data) {
      setResults(data);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, []);

  // Reset page on query change + debounce
  useEffect(() => {
    setPage(0);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      fetchStocks(query, 0);
    }, 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, fetchStocks]);

  // Fetch on page change (not on query change — that's handled above)
  useEffect(() => {
    if (page > 0) fetchStocks(query, page);
  }, [page, fetchStocks]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

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
            <>
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

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-border">
                  <span className="text-xs text-muted-foreground">
                    Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page === 0}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Prev
                    </Button>
                    <span className="text-xs text-muted-foreground px-2">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page >= totalPages - 1}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              {query.trim()
                ? `No results found for '${query}'. Try a different name or ticker.`
                : "No stocks available. Check back later."}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
