import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Lock, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { AdBanner } from "@/components/layout/AdBanner";
import { Footer } from "@/components/layout/Footer";
import { tickerToSlug } from "@/lib/ticker-utils";

const CHART_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#8b5cf6", "#ec4899"];

const POPULAR_COMPARISONS = [
  ["AAPL", "NVDA"], ["AAPL", "MSFT"], ["PLTR", "NVDA"], ["NVDA", "AMD"],
  ["NVDA", "AVGO"], ["KO", "PEP"], ["TSLA", "NVDA"], ["MSFT", "NVDA"],
  ["LLY", "NVO"], ["GOOGL", "META"], ["MSFT", "CRM"], ["AAPL", "BRK.B"],
  ["V", "MA"], ["XOM", "CVX"], ["AMZN", "TSLA"], ["AMD", "INTC"],
];

export default function StockComparePage() {
  const navigate = useNavigate();
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState("");
  const [showResults, setShowResults] = useState(false);

  const { data: searchResults } = useQuery({
    queryKey: ["compare-search", searchValue],
    queryFn: async () => {
      if (searchValue.length < 1) return [];
      const { data } = await supabase
        .from("stocks")
        .select("symbol, name")
        .or(`symbol.ilike.%${searchValue}%,name.ilike.%${searchValue}%`)
        .limit(8);
      return data || [];
    },
    enabled: searchValue.length >= 1,
  });

  const { data: stockData } = useQuery({
    queryKey: ["compare-stocks", selectedTickers],
    queryFn: async () => {
      if (selectedTickers.length === 0) return [];
      const { data } = await supabase
        .from("stocks")
        .select("symbol, name, price, change_percent, market_cap, pe_ratio, volume, sector, industry")
        .in("symbol", selectedTickers);
      return data || [];
    },
    enabled: selectedTickers.length > 0,
  });

  const addTicker = (symbol: string) => {
    if (!selectedTickers.includes(symbol) && selectedTickers.length < 6) {
      setSelectedTickers((prev) => [...prev, symbol]);
    }
    setSearchValue("");
    setShowResults(false);
  };

  const removeTicker = (symbol: string) => {
    setSelectedTickers((prev) => prev.filter((t) => t !== symbol));
  };

  const chartData = useMemo(() => {
    if (!stockData || stockData.length === 0) return [];
    // Simple single-point chart placeholder — normalize to 100 base
    return [
      { name: "Current", ...Object.fromEntries(stockData.map((s) => [s.symbol, 100])) },
      { name: "+Change", ...Object.fromEntries(stockData.map((s) => [s.symbol, 100 + (s.change_percent || 0)])) },
    ];
  }, [stockData]);

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/" className="text-[0.8125rem]">Home</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/screener" className="text-[0.8125rem]">Stocks</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage className="text-[0.8125rem]">Compare</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[1.375rem] font-bold text-foreground">Compare Stocks</h1>
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground">
            Full Width <Lock className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Search + Controls */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-[600px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search for a stock..."
              value={searchValue}
              onChange={(e) => { setSearchValue(e.target.value); setShowResults(true); }}
              onFocus={() => setShowResults(true)}
              className="pl-9 h-10"
            />
            {showResults && searchResults && searchResults.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((s) => (
                  <button
                    key={s.symbol}
                    onClick={() => addTicker(s.symbol)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between"
                  >
                    <span className="font-semibold text-primary">{s.symbol}</span>
                    <span className="text-muted-foreground truncate ml-2">{s.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">Total Return (%)</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Total Return (%)</DropdownMenuItem>
                <DropdownMenuItem>Price</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm">Saved</Button>
            <Button variant="outline" size="sm">Options</Button>
          </div>
        </div>

        {/* Selected ticker pills */}
        {selectedTickers.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {selectedTickers.map((t, i) => (
              <Badge key={t} variant="outline" className="gap-1 px-3 py-1 text-sm" style={{ borderColor: CHART_COLORS[i % CHART_COLORS.length] }}>
                <span style={{ color: CHART_COLORS[i % CHART_COLORS.length] }} className="font-semibold">{t}</span>
                <button onClick={() => removeTicker(t)}><X className="h-3 w-3 text-muted-foreground" /></button>
              </Badge>
            ))}
          </div>
        )}

        {/* Chart Area */}
        <div className="border border-border rounded-[var(--radius)] min-h-[300px] flex items-center justify-center mb-8">
          {selectedTickers.length === 0 ? (
            <p className="text-muted-foreground text-base">Add a symbol to get started</p>
          ) : (
            <div className="w-full h-[350px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {selectedTickers.map((t, i) => (
                    <Line key={t} type="monotone" dataKey={t} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Comparison Table */}
        {stockData && stockData.length > 0 && (
          <div className="overflow-x-auto mb-8">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Metric</th>
                  {stockData.map((s) => (
                    <th key={s.symbol} className="text-right py-2 px-3 text-[0.8125rem] font-semibold">
                      <button onClick={() => navigate(`/stocks/${tickerToSlug(s.symbol)}`)} className="text-primary hover:underline">{s.symbol}</button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Price", key: "price", fmt: (v: any) => v != null ? `$${Number(v).toFixed(2)}` : "—" },
                  { label: "% Change", key: "change_percent", fmt: (v: any) => v != null ? `${Number(v).toFixed(2)}%` : "—" },
                  { label: "Market Cap", key: "market_cap", fmt: (v: any) => v != null ? `$${(Number(v) / 1e9).toFixed(1)}B` : "—" },
                  { label: "P/E Ratio", key: "pe_ratio", fmt: (v: any) => v != null ? Number(v).toFixed(1) : "—" },
                  { label: "Volume", key: "volume", fmt: (v: any) => v != null ? Number(v).toLocaleString() : "—" },
                  { label: "Sector", key: "sector", fmt: (v: any) => v || "—" },
                  { label: "Industry", key: "industry", fmt: (v: any) => v || "—" },
                ].map((row) => (
                  <tr key={row.key} className="border-b border-border hover:bg-muted/50">
                    <td className="py-2 px-3 text-[0.875rem] text-muted-foreground">{row.label}</td>
                    {stockData.map((s) => (
                      <td key={s.symbol} className="py-2 px-3 text-right text-[0.875rem]">{row.fmt((s as any)[row.key])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Popular Comparisons */}
        <div className="mb-8">
          <h2 className="text-[1.125rem] font-bold text-foreground mb-4">Popular Stock Comparisons</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {POPULAR_COMPARISONS.map(([a, b]) => (
              <button
                key={`${a}-${b}`}
                onClick={() => { setSelectedTickers([a, b]); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="border border-border rounded-[var(--radius)] px-4 py-2 text-[0.875rem] text-primary font-medium hover:border-accent-blue transition-colors text-center"
              >
                {a} vs. {b}
              </button>
            ))}
          </div>
        </div>
      </div>

      <AdBanner />
      <Footer />
    </div>
  );
}
