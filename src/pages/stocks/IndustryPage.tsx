import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, ChevronUp, Lock, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AdBanner } from "@/components/layout/AdBanner";


function abbreviateNumber(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toFixed(0)}`;
}

interface IndustryRow {
  industry: string;
  stocks: number;
  market_cap: number;
  pe_ratio: number | null;
  change_1d: number | null;
  ytd_change: number | null;
}

interface SectorGroup {
  sector: string;
  totalStocks: number;
  totalMarketCap: number;
  industries: IndustryRow[];
}

const SECTOR_ORDER = [
  "Healthcare", "Financials", "Technology", "Industrials",
  "Consumer Staples", "Consumer Discretionary", "Energy",
  "Communication Services", "Materials", "Real Estate", "Utilities",
];

export default function IndustryPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Overview");
  const [openSectors, setOpenSectors] = useState<Set<string>>(new Set(SECTOR_ORDER));

  const { data: stocks, isLoading } = useQuery({
    queryKey: ["industry-stocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stocks")
        .select("sector, industry, market_cap, pe_ratio, change_percent");
      if (error) throw error;
      return data || [];
    },
  });

  const sectorGroups: SectorGroup[] = useMemo(() => {
    if (!stocks) return [];
    const map: Record<string, Record<string, typeof stocks>> = {};
    stocks.forEach((s) => {
      const sector = s.sector || "Other";
      const industry = s.industry || "Other";
      if (!map[sector]) map[sector] = {};
      if (!map[sector][industry]) map[sector][industry] = [];
      map[sector][industry].push(s);
    });

    return SECTOR_ORDER
      .filter((s) => map[s])
      .map((sector) => {
        const industries = Object.entries(map[sector]).map(([industry, items]) => ({
          industry,
          stocks: items.length,
          market_cap: items.reduce((sum, s) => sum + (s.market_cap || 0), 0),
          pe_ratio: items.filter((s) => s.pe_ratio).length > 0
            ? items.reduce((sum, s) => sum + (s.pe_ratio || 0), 0) / items.filter((s) => s.pe_ratio).length
            : null,
          change_1d: items.filter((s) => s.change_percent != null).length > 0
            ? items.reduce((sum, s) => sum + (s.change_percent || 0), 0) / items.filter((s) => s.change_percent != null).length
            : null,
          ytd_change: null as number | null,
        }));
        industries.sort((a, b) => b.market_cap - a.market_cap);
        return {
          sector,
          totalStocks: industries.reduce((s, i) => s + i.stocks, 0),
          totalMarketCap: industries.reduce((s, i) => s + i.market_cap, 0),
          industries,
        };
      })
      .concat(
        Object.keys(map)
          .filter((s) => !SECTOR_ORDER.includes(s))
          .map((sector) => {
            const industries = Object.entries(map[sector]).map(([industry, items]) => ({
              industry,
              stocks: items.length,
              market_cap: items.reduce((sum, s) => sum + (s.market_cap || 0), 0),
              pe_ratio: null,
              change_1d: null,
              ytd_change: null,
            }));
            return {
              sector,
              totalStocks: industries.reduce((s, i) => s + i.stocks, 0),
              totalMarketCap: industries.reduce((s, i) => s + i.market_cap, 0),
              industries,
            };
          })
      );
  }, [stocks]);

  const toggleSector = (sector: string) => {
    setOpenSectors((prev) => {
      const next = new Set(prev);
      if (next.has(sector)) next.delete(sector);
      else next.add(sector);
      return next;
    });
  };

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-[1.375rem] font-bold text-foreground">Stock Sectors & Industries</h1>
          <Button variant="outline" size="sm" className="gap-1.5 text-muted-foreground">
            Full Width <Lock className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-border mb-4">
          {["Overview", "Sectors"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "pb-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab
                  ? "border-b-accent-blue text-foreground"
                  : "border-b-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Info text */}
        <p className="text-sm text-muted-foreground mb-6">
          Breakdown categories include the 11 sectors and 145 industries, based on the standard business activity classification.
        </p>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
          </div>
        ) : (
          <div className="space-y-6">
            {sectorGroups.map((group) => {
              const isOpen = openSectors.has(group.sector);
              return (
                <div key={group.sector} className="border border-border rounded-[var(--radius)]">
                  {/* Sector heading */}
                  <button
                    onClick={() => toggleSector(group.sector)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <h2 className="text-base font-bold text-foreground">Sector: {group.sector}</h2>
                      <span className="text-sm text-muted-foreground">{group.totalStocks} stocks</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Industry table */}
                  {isOpen && (
                    <div className="overflow-x-auto border-t border-border">
                      <table className="w-full text-sm border-collapse min-w-[700px]">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="text-left py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Industry</th>
                            <th className="text-right py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Stocks</th>
                            <th className="text-right py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">Market Cap</th>
                            <th className="text-right py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">P/E Ratio</th>
                            <th className="text-right py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground">1D Change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {group.industries.map((ind) => (
                            <tr key={ind.industry} className="border-b border-border last:border-b-0 hover:bg-surface transition-colors">
                              <td className="py-2 px-3">
                                <button
                                  onClick={() => navigate(`/screener?industry=${encodeURIComponent(ind.industry)}`)}
                                  className="text-primary hover:underline text-[0.875rem] font-medium"
                                >
                                  {ind.industry}
                                </button>
                              </td>
                              <td className="py-2 px-3 text-right text-[0.875rem] tabular-nums">{ind.stocks}</td>
                              <td className="py-2 px-3 text-right text-[0.875rem] tabular-nums">{abbreviateNumber(ind.market_cap)}</td>
                              <td className="py-2 px-3 text-right text-[0.875rem] tabular-nums">
                                {ind.pe_ratio != null ? ind.pe_ratio.toFixed(1) : "—"}
                              </td>
                              <td className={cn(
                                "py-2 px-3 text-right text-[0.875rem] tabular-nums font-medium",
                                (ind.change_1d ?? 0) >= 0 ? "text-green" : "text-destructive"
                              )}>
                                {ind.change_1d != null ? `${ind.change_1d >= 0 ? "+" : ""}${ind.change_1d.toFixed(2)}%` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AdBanner />
      
    </div>
  );
}
