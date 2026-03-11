import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronUp } from "lucide-react";
import {
  useReactTable, getCoreRowModel, getSortedRowModel, type SortingState, type ColumnDef, flexRender,
} from "@tanstack/react-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AdBanner } from "@/components/layout/AdBanner";
import { Footer } from "@/components/layout/Footer";

interface Provider {
  name: string;
  slug: string;
  etfs: number;
  assets: number;
  avgAssets: number;
  change: number;
  ytd: number;
}

const PROVIDERS: Provider[] = [
  { name: "Vanguard", slug: "vanguard", etfs: 86, assets: 2.85e12, avgAssets: 33.14e9, change: 0.92, ytd: 8.45 },
  { name: "iShares (BlackRock)", slug: "ishares", etfs: 430, assets: 2.73e12, avgAssets: 6.35e9, change: 0.78, ytd: 7.82 },
  { name: "State Street (SPDR)", slug: "state-street", etfs: 143, assets: 1.32e12, avgAssets: 9.23e9, change: 0.85, ytd: 7.55 },
  { name: "Invesco", slug: "invesco", etfs: 238, assets: 582e9, avgAssets: 2.45e9, change: 1.12, ytd: 9.10 },
  { name: "Schwab", slug: "schwab", etfs: 29, assets: 378e9, avgAssets: 13.03e9, change: 0.68, ytd: 7.20 },
  { name: "Fidelity", slug: "fidelity", etfs: 70, assets: 95.4e9, avgAssets: 1.36e9, change: 0.74, ytd: 6.88 },
  { name: "First Trust", slug: "first-trust", etfs: 204, assets: 188e9, avgAssets: 921e6, change: 0.55, ytd: 5.92 },
  { name: "JPMorgan", slug: "jpmorgan", etfs: 62, assets: 168e9, avgAssets: 2.71e9, change: 0.62, ytd: 6.45 },
  { name: "Dimensional", slug: "dimensional", etfs: 33, assets: 152e9, avgAssets: 4.61e9, change: 0.48, ytd: 5.78 },
  { name: "WisdomTree", slug: "wisdomtree", etfs: 76, assets: 108e9, avgAssets: 1.42e9, change: -0.22, ytd: 3.40 },
  { name: "VanEck", slug: "vaneck", etfs: 68, assets: 89.2e9, avgAssets: 1.31e9, change: 0.95, ytd: 8.12 },
  { name: "ProShares", slug: "proshares", etfs: 140, assets: 78.5e9, avgAssets: 561e6, change: 1.85, ytd: 12.30 },
  { name: "ARK Invest", slug: "ark-invest", etfs: 12, assets: 14.2e9, avgAssets: 1.18e9, change: 2.45, ytd: 18.50 },
  { name: "PIMCO", slug: "pimco", etfs: 26, assets: 42.8e9, avgAssets: 1.65e9, change: 0.15, ytd: 2.85 },
  { name: "Goldman Sachs", slug: "goldman-sachs", etfs: 48, assets: 38.5e9, avgAssets: 802e6, change: 0.58, ytd: 6.10 },
  { name: "Northern Trust", slug: "northern-trust", etfs: 22, assets: 28.9e9, avgAssets: 1.31e9, change: 0.42, ytd: 4.95 },
  { name: "Nuveen", slug: "nuveen", etfs: 30, assets: 24.1e9, avgAssets: 803e6, change: 0.38, ytd: 4.22 },
  { name: "Global X", slug: "global-x", etfs: 108, assets: 48.7e9, avgAssets: 451e6, change: 0.72, ytd: 5.55 },
  { name: "Direxion", slug: "direxion", etfs: 82, assets: 42.3e9, avgAssets: 516e6, change: 3.20, ytd: -2.15 },
  { name: "Pacer", slug: "pacer", etfs: 35, assets: 18.6e9, avgAssets: 531e6, change: 0.88, ytd: 7.60 },
  { name: "Amplify", slug: "amplify", etfs: 28, assets: 8.9e9, avgAssets: 318e6, change: 0.65, ytd: 5.30 },
  { name: "Roundhill", slug: "roundhill", etfs: 14, assets: 5.8e9, avgAssets: 414e6, change: 1.55, ytd: 11.20 },
  { name: "Innovator", slug: "innovator", etfs: 105, assets: 20.4e9, avgAssets: 194e6, change: 0.35, ytd: 4.80 },
  { name: "Simplify", slug: "simplify", etfs: 26, assets: 4.2e9, avgAssets: 162e6, change: 0.28, ytd: 3.10 },
  { name: "Themes", slug: "themes", etfs: 18, assets: 1.1e9, avgAssets: 61e6, change: 1.10, ytd: 8.90 },
  { name: "Tidal", slug: "tidal", etfs: 42, assets: 3.5e9, avgAssets: 83e6, change: 0.92, ytd: 6.70 },
  { name: "REX Shares", slug: "rex-shares", etfs: 10, assets: 2.8e9, avgAssets: 280e6, change: 2.10, ytd: 15.40 },
  { name: "Tuttle Capital", slug: "tuttle-capital", etfs: 8, assets: 1.4e9, avgAssets: 175e6, change: 1.75, ytd: 13.60 },
  { name: "YieldMax", slug: "yieldmax", etfs: 34, assets: 6.2e9, avgAssets: 182e6, change: -0.45, ytd: -1.20 },
  { name: "Defiance", slug: "defiance", etfs: 22, assets: 4.8e9, avgAssets: 218e6, change: 1.30, ytd: 9.85 },
];

function abbr(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toLocaleString()}`;
}

export default function EtfProvidersPage() {
  const navigate = useNavigate();
  const [sorting, setSorting] = useState<SortingState>([{ id: "assets", desc: true }]);

  const columns = useMemo<ColumnDef<Provider>[]>(() => [
    {
      accessorKey: "name",
      header: "Provider Name",
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
      accessorKey: "change", header: "% Change", size: 90, meta: { align: "right" },
      cell: ({ getValue }) => { const v = getValue() as number; return <span className={`text-[0.875rem] font-medium ${v >= 0 ? "text-green" : "text-red"}`}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>; },
    },
    {
      accessorKey: "ytd", header: "YTD Return", size: 90, meta: { align: "right" },
      cell: ({ getValue }) => { const v = getValue() as number; return <span className={`text-[0.875rem] font-medium ${v >= 0 ? "text-green" : "text-red"}`}>{v >= 0 ? "+" : ""}{v.toFixed(2)}%</span>; },
    },
  ], [navigate]);

  const table = useReactTable({
    data: PROVIDERS,
    columns,
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
          {/* Main table */}
          <div className="flex-1 min-w-0 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b-2 border-border bg-muted/30">
                    {hg.headers.map((h) => (
                      <th
                        key={h.id}
                        className={`py-2 px-3 text-[0.8125rem] font-semibold text-muted-foreground cursor-pointer select-none ${(h.column.columnDef.meta as any)?.align === "right" ? "text-right" : "text-left"}`}
                        style={{ width: h.column.getSize() !== 150 ? h.column.getSize() : undefined }}
                        onClick={h.column.getToggleSortingHandler()}
                      >
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

            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center justify-center gap-1 w-full py-3 text-[0.875rem] text-primary hover:underline mt-2">
              <ChevronUp className="h-4 w-4" /> Back to Top
            </button>
          </div>

          {/* Sidebar */}
          <aside className="hidden lg:flex flex-col gap-4 w-[300px] shrink-0">
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[1rem] font-bold text-foreground mb-2">Stock Analysis Pro</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">Upgrade now for unlimited access to all data and tools.</p>
              <Button size="sm" className="w-full">Sign Up Today</Button>
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
              <Button variant="outline" size="sm" className="text-primary border-primary">Learn More</Button>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
}
