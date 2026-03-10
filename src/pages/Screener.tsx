import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/analytics";

type SortKey = "symbol" | "name" | "price" | "change_percent" | "market_cap" | "pe_ratio" | "volume" | "sector";
type SortDir = "asc" | "desc";

const Screener = () => {
  const navigate = useNavigate();
  const [showFilters, setShowFilters] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("market_cap");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [exchangeFilter, setExchangeFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const { data: stocks, isLoading } = useQuery({
    queryKey: ["screener-stocks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stocks")
        .select("symbol, name, price, change_percent, market_cap, pe_ratio, volume, sector, exchange")
        .order("market_cap", { ascending: false, nullsFirst: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
  });

  const sectors = useMemo(() => {
    const s = new Set((stocks ?? []).map((st) => st.sector).filter(Boolean));
    return Array.from(s).sort();
  }, [stocks]);

  const exchanges = useMemo(() => {
    const e = new Set((stocks ?? []).map((st) => st.exchange).filter(Boolean));
    return Array.from(e).sort();
  }, [stocks]);

  const filtered = useMemo(() => {
    let list = [...(stocks ?? [])];
    if (sectorFilter !== "all") list = list.filter((s) => s.sector === sectorFilter);
    if (exchangeFilter !== "all") list = list.filter((s) => s.exchange === exchangeFilter);
    list.sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return list;
  }, [stocks, sectorFilter, exchangeFilter, sortKey, sortDir]);

  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th
      className="table-header text-left px-3 py-2 cursor-pointer select-none hover:text-foreground"
      onClick={() => toggleSort(field)}
    >
      {label} {sortKey === field ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  return (
    <div className="flex flex-col md:flex-row">
      {/* Filter panel */}
      <div className={cn("md:w-[220px] shrink-0 border-r border-border p-4 space-y-4", showFilters ? "block" : "hidden md:block")}>
        <h3 className="text-sm font-bold text-foreground">Filters</h3>
        <div>
          <label className="text-xs text-muted-foreground">Sector</label>
          <Select value={sectorFilter} onValueChange={setSectorFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sectors</SelectItem>
              {sectors.map((s) => <SelectItem key={s} value={s!}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Exchange</label>
          <Select value={exchangeFilter} onValueChange={setExchangeFilter}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Exchanges</SelectItem>
              {exchanges.map((e) => <SelectItem key={e} value={e!}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 min-w-0 p-4">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-foreground">Stock Screener</h1>
          <Button variant="outline" size="sm" className="md:hidden" onClick={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal className="h-4 w-4 mr-1" /> Filters
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">{Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <>
            <div className="fintech-card overflow-x-auto">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="border-b border-border">
                    <SortHeader label="Symbol" field="symbol" />
                    <SortHeader label="Name" field="name" />
                    <th className="table-header text-right px-3 py-2 cursor-pointer" onClick={() => toggleSort("price")}>Price {sortKey === "price" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
                    <th className="table-header text-right px-3 py-2 cursor-pointer" onClick={() => toggleSort("change_percent")}>Change % {sortKey === "change_percent" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
                    <th className="table-header text-right px-3 py-2 cursor-pointer hidden md:table-cell" onClick={() => toggleSort("market_cap")}>Mkt Cap {sortKey === "market_cap" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
                    <th className="table-header text-right px-3 py-2 cursor-pointer hidden md:table-cell" onClick={() => toggleSort("pe_ratio")}>P/E {sortKey === "pe_ratio" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
                    <th className="table-header text-right px-3 py-2 cursor-pointer hidden lg:table-cell" onClick={() => toggleSort("volume")}>Volume {sortKey === "volume" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
                    <th className="table-header text-left px-3 py-2 hidden lg:table-cell">Sector</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((s) => (
                    <tr key={s.symbol} className="border-b border-border last:border-b-0 hover:bg-accent/50">
                      <td className="px-3 py-2">
                        <button onClick={() => { trackEvent("stock_search", { ticker: s.symbol }); navigate(`/stocks/${s.symbol.toLowerCase()}`); }} className="ticker-symbol text-accent-blue hover:underline text-sm">{s.symbol}</button>
                      </td>
                      <td className="px-3 py-2 text-foreground truncate max-w-[160px]">{s.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">${(s.price ?? 0).toFixed(2)}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums font-medium", (s.change_percent ?? 0) >= 0 ? "price-positive" : "price-negative")}>
                        {(s.change_percent ?? 0) >= 0 ? "↑" : "↓"} {Math.abs(s.change_percent ?? 0).toFixed(2)}%
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums hidden md:table-cell">{s.market_cap ? `$${(s.market_cap / 1e9).toFixed(1)}B` : "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums hidden md:table-cell">{s.pe_ratio?.toFixed(1) ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums hidden lg:table-cell">{s.volume?.toLocaleString() ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground text-xs hidden lg:table-cell">{s.sector ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Button>
                <span className="text-xs text-muted-foreground">Page {page + 1} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Screener;
