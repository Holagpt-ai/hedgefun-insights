import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronUp } from "lucide-react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, type SortingState, type ColumnDef, flexRender,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdBanner } from "@/components/layout/AdBanner";

interface Provider {
  name: string;
  slug: string;
  etfs: number;
  assets: number;
  avgAssets: number;
  change: number;
}

function abbr(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

export default function EtfProvidersPage() {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([{ id: "assets", desc: true }]);

  const { data: dbData, isLoading } = useQuery({
    queryKey: ["etfs-providers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("etfs")
        .select("provider, total_assets, change_percent");
      if (error) throw error;

      // Aggregate by provider
      const map = new Map<string, { count: number; totalAssets: number; totalChange: number }>();
      for (const r of data ?? []) {
        const provider = r.provider || "Unknown";
        const existing = map.get(provider) || { count: 0, totalAssets: 0, totalChange: 0 };
        existing.count++;
        existing.totalAssets += Number(r.total_assets ?? 0);
        existing.totalChange += Number(r.change_percent ?? 0);
        map.set(provider, existing);
      }

      return Array.from(map.entries())
        .filter(([name]) => name !== "Unknown")
        .map(([name, v]) => ({
          name,
          slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          etfs: v.count,
          assets: v.totalAssets,
          avgAssets: v.count > 0 ? v.totalAssets / v.count : 0,
          change: v.count > 0 ? v.totalChange / v.count : 0,
        })) as Provider[];
    },
  });

  const providers = dbData ?? [];

  const columns = useMemo<ColumnDef<Provider>[]>(() => [
    {
      accessorKey: "name", header: "Provider Name",
      cell: ({ row }) => (
        <button onClick={() => navigate(`/etf/provider/${row.original.slug}`)} className="text-primary font-bold text-[0.875rem] hover:underline">
          {row.original.name}
        </button>
      ),
    },
    { accessorKey: "etfs", header: "ETFs", size: 70, meta: { align: "right" }, cell: ({ getValue }) => <span className="text-[0.875rem]">{(getValue() as number).toLocaleString()}</span> },
    { accessorKey: "assets", header: "Assets", size: 110, meta: { align: "right" }, cell: ({ getValue }) => <span className="text-[0.875rem]">{abbr(getValue() as number)}</span> },
    { accessorKey: "avgAssets", header: "Avg Assets", size: 110, meta: { align: "right" }, cell: ({ getValue }) => <span className="text-[0.875rem]">{abbr(getValue() as number)}</span> },
    {
      accessorKey: "change", header: "Avg % Change", size: 90, meta: { align: "right" },
      cell: ({ getValue }) => { const v = getValue() as number; return <span className={`text-[0.875rem] font-medium ${v >= 0 ? "text-green" : "text-red"}`}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>; },
    },
  ], [navigate]);

  const table = useReactTable({
    data: providers, columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="min-w-0">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-[1.375rem] font-bold text-foreground mb-5">ETF Providers</h1>

        <div className="flex gap-6">
          <div className="flex-1 min-w-0 overflow-x-auto">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 10 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : providers.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">No provider data available yet.</p>
            ) : (
              <table className="w-full text-sm border-collapse">
                <thead>
                  {table.getHeaderGroups().map((hg) => (
                    <tr key={hg.id} className="border-b-2 border-border bg-muted/30">
                      {hg.headers.map((h) => (
                        <th key={h.id} className={`py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground cursor-pointer select-none ${(h.column.columnDef.meta as any)?.align === "right" ? "text-right" : "text-left"}`} style={{ width: h.column.getSize() !== 150 ? h.column.getSize() : undefined }} onClick={h.column.getToggleSortingHandler()}>
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b border-border hover:bg-muted/50">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className={`py-[7px] px-3 ${(cell.column.columnDef.meta as any)?.align === "right" ? "text-right" : "text-left"}`}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center justify-center gap-1 w-full py-3 text-[0.875rem] text-primary hover:underline mt-2">
              <ChevronUp className="h-4 w-4" /> Back to Top
            </button>
          </div>

          <aside className="hidden lg:flex flex-col gap-4 w-[300px] shrink-0">
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[1rem] font-bold text-foreground mb-2">Stock Analysis Pro</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">Upgrade now for unlimited access to all data and tools.</p>
              <Button size="sm" className="w-full" onClick={() => navigate("/pro")}>Sign Up Today</Button>
            </div>
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[1rem] font-bold text-foreground mb-2">Market Newsletter</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">Get a daily email with the top market news in bullet point format.</p>
              <div className="flex gap-2">
                <Input placeholder="Enter your email" className="h-8 text-sm flex-1" />
                <Button size="sm">Subscribe</Button>
              </div>
            </div>
            <AdBanner />
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[1rem] font-bold text-foreground mb-2">Learn More</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">Explore detailed ETF provider data including fund counts, total assets under management, and performance metrics.</p>
              <Button variant="outline" size="sm" className="text-primary border-primary" onClick={() => navigate("/etf/screener")}>Learn More</Button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
