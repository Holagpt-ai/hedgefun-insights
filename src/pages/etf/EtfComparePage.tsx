import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Lock, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbSeparator, BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";

const CHART_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#f59e0b", "#8b5cf6", "#ec4899"];

const POPULAR_COMPARISONS = [
  ["QQQ", "SPY"], ["VOO", "VUG"], ["QQQ", "VGT"], ["IVV", "VOO"],
  ["VOO", "VTI"], ["QQQ", "VOOG"], ["IVV", "VTI"], ["IVV", "SPY"],
  ["SPY", "VOO"], ["QQQ", "VOO"], ["QQQ", "QQQM"], ["VT", "VTI"],
  ["QQQ", "TQQQ"], ["ITOT", "VTI"], ["JEPI", "JEPQ"], ["JEPI", "QYLD"],
];

interface EtfData {
  symbol: string;
  name: string;
  price: number | null;
  change_percent: number | null;
  total_assets: number | null;
  expense_ratio: number | null;
  holdings: number | null;
}

export default function EtfComparePage() {
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const navigate = useNavigate();
  const [searchValue, setSearchValue] = useState("");
  const [showResults, setShowResults] = useState(false);

  // Fetch all ETFs for search
  const { data: allEtfs } = useQuery({
    queryKey: ["etfs-compare-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etfs")
        .select("symbol, name, price, change_percent, total_assets, expense_ratio, holdings");
      if (error) throw error;
      return data as EtfData[];
    },
  });

  const etfMap = useMemo(() => {
    const map: Record<string, EtfData> = {};
    for (const e of allEtfs ?? []) map[e.symbol] = e;
    return map;
  }, [allEtfs]);

  const allSymbols = useMemo(() => Object.keys(etfMap), [etfMap]);

  const searchResults = useMemo(() => {
    if (searchValue.length < 1) return [];
    const q = searchValue.toUpperCase();
    return allSymbols.filter(
      (s) => s.includes(q) || (etfMap[s]?.name ?? "").toUpperCase().includes(q)
    ).slice(0, 8);
  }, [searchValue, allSymbols, etfMap]);

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
    if (selectedTickers.length === 0) return [];
    return [
      { name: "Current", ...Object.fromEntries(selectedTickers.map((t) => [t, 100])) },
      { name: "+Change", ...Object.fromEntries(selectedTickers.map((t) => [t, 100 + Number(etfMap[t]?.change_percent || 0)])) },
    ];
  }, [selectedTickers, etfMap]);

  const stockData = selectedTickers.map((t) => etfMap[t]).filter(Boolean);

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem><BreadcrumbLink href="/" className="text-[0.8125rem]">Home</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbLink href="/etf/screener" className="text-[0.8125rem]">ETFs</BreadcrumbLink></BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem><BreadcrumbPage className="text-[0.8125rem]">Compare</BreadcrumbPage></BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-[1.375rem] font-bold text-foreground">Compare ETFs</h1>
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => navigate("/pro")}>Full Width <Lock className="h-3.5 w-3.5" /></Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1 max-w-[600px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search for an ETF" value={searchValue} onChange={(e) => { setSearchValue(e.target.value); setShowResults(true); }} onFocus={() => setShowResults(true)} className="pl-9 h-10" />
            {showResults && searchResults.length > 0 && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map((s) => (
                  <button key={s} onClick={() => addTicker(s)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex justify-between">
                    <span className="font-semibold text-primary">{s}</span>
                    <span className="text-muted-foreground truncate ml-2">{etfMap[s]?.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" size="sm">Total Return (%)</Button></DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Total Return (%)</DropdownMenuItem>
                <DropdownMenuItem>Price</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm">Saved</Button>
            <Button variant="outline" size="sm">Options</Button>
          </div>
        </div>

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

        <div className="border border-border rounded-[var(--radius)] min-h-[320px] flex items-center justify-center mb-8">
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

        {stockData.length > 0 && (
          <div className="overflow-x-auto mb-8">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Metric</th>
                  {stockData.map((s) => (
                    <th key={s.symbol} className="text-right py-2 px-3 text-[0.8125rem] font-semibold text-primary">{s.symbol}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Price", fmt: (s: EtfData) => s.price != null ? `$${Number(s.price).toFixed(2)}` : "—" },
                  { label: "% Change", fmt: (s: EtfData) => s.change_percent != null ? `${Number(s.change_percent).toFixed(2)}%` : "—" },
                  { label: "Assets", fmt: (s: EtfData) => s.total_assets != null ? `$${(Number(s.total_assets) / 1e9).toFixed(1)}B` : "—" },
                  { label: "Expense Ratio", fmt: (s: EtfData) => s.expense_ratio != null ? `${Number(s.expense_ratio).toFixed(2)}%` : "—" },
                  { label: "Holdings", fmt: (s: EtfData) => s.holdings != null ? s.holdings.toLocaleString() : "—" },
                ].map((row) => (
                  <tr key={row.label} className="border-b border-border hover:bg-muted/50">
                    <td className="py-2 px-3 text-[0.875rem] text-muted-foreground">{row.label}</td>
                    {stockData.map((s) => (
                      <td key={s.symbol} className="py-2 px-3 text-right text-[0.875rem]">{row.fmt(s)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-[1.125rem] font-bold text-foreground mb-4">Popular ETF Comparisons</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {POPULAR_COMPARISONS.map(([a, b]) => (
              <button key={`${a}-${b}`} onClick={() => { setSelectedTickers([a, b]); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="border border-border rounded-[var(--radius)] px-4 py-2 text-[0.875rem] text-primary font-medium hover:border-accent-blue transition-colors text-center">
                {a} vs. {b}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
