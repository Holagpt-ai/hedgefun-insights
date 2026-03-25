import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Info, ChevronUp, ChevronDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { AdBanner } from "@/components/layout/AdBanner";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";

interface Exchange {
  name: string;
  country: string;
  flag: string;
  code: string;
  currency: string;
  stocks: number;
}

const EXCHANGE_WEBSITES: Record<string, string> = {
  "Bombay Stock Exchange": "https://www.bseindia.com",
  "Tokyo Stock Exchange": "https://www.jpx.co.jp/english",
  "NASDAQ": "https://www.nasdaq.com",
  "New York Stock Exchange": "https://www.nyse.com",
  "London Stock Exchange": "https://www.londonstockexchange.com",
  "Shanghai Stock Exchange": "https://english.sse.com.cn",
  "Shenzhen Stock Exchange": "https://www.szse.cn/English",
  "Hong Kong Stock Exchange": "https://www.hkex.com.hk",
  "Euronext Paris": "https://www.euronext.com",
  "Euronext Amsterdam": "https://www.euronext.com",
  "Toronto Stock Exchange": "https://www.tsx.com",
  "Frankfurt Stock Exchange": "https://www.boerse-frankfurt.de/en",
  "National Stock Exchange of India": "https://www.nseindia.com",
  "Korea Exchange": "https://global.krx.co.kr",
  "Australian Securities Exchange": "https://www.asx.com.au",
  "SIX Swiss Exchange": "https://www.six-group.com",
  "Stockholm Stock Exchange": "https://www.nasdaqomxnordic.com",
  "Singapore Exchange": "https://www.sgx.com",
  "B3 — Brasil Bolsa Balcão": "https://www.b3.com.br/en_us",
  "Borsa Italiana": "https://www.borsaitaliana.it/homepage/homepage.en.htm",
  "Johannesburg Stock Exchange": "https://www.jse.co.za",
  "Taiwan Stock Exchange": "https://www.twse.com.tw/en",
  "Tel Aviv Stock Exchange": "https://www.tase.co.il/en",
  "Saudi Stock Exchange": "https://www.saudiexchange.sa/wps/portal/saudiexchange",
  "Istanbul Stock Exchange": "https://www.borsaistanbul.com/en",
  "Warsaw Stock Exchange": "https://www.gpw.pl/en-home",
};

const EXCHANGES: Exchange[] = [
  { name: "New York Stock Exchange", country: "United States", flag: "🇺🇸", code: "NYSE", currency: "USD", stocks: 2272 },
  { name: "NASDAQ", country: "United States", flag: "🇺🇸", code: "NASDAQ", currency: "USD", stocks: 3553 },
  { name: "Frankfurt Stock Exchange", country: "Germany", flag: "🇩🇪", code: "FRA", currency: "EUR", stocks: 1504 },
  { name: "Bombay Stock Exchange", country: "India", flag: "🇮🇳", code: "BSE", currency: "INR", stocks: 4786 },
  { name: "National Stock Exchange of India", country: "India", flag: "🇮🇳", code: "NSE", currency: "INR", stocks: 2103 },
  { name: "London Stock Exchange", country: "United Kingdom", flag: "🇬🇧", code: "LSE", currency: "GBP", stocks: 1988 },
  { name: "Toronto Stock Exchange", country: "Canada", flag: "🇨🇦", code: "TSX", currency: "CAD", stocks: 1647 },
  { name: "Shanghai Stock Exchange", country: "China", flag: "🇨🇳", code: "SSE", currency: "CNY", stocks: 2187 },
  { name: "Shenzhen Stock Exchange", country: "China", flag: "🇨🇳", code: "SZSE", currency: "CNY", stocks: 2747 },
  { name: "Hong Kong Stock Exchange", country: "Hong Kong", flag: "🇭🇰", code: "HKEX", currency: "HKD", stocks: 2597 },
  { name: "Tokyo Stock Exchange", country: "Japan", flag: "🇯🇵", code: "TSE", currency: "JPY", stocks: 3930 },
  { name: "Korea Exchange", country: "South Korea", flag: "🇰🇷", code: "KRX", currency: "KRW", stocks: 2400 },
  { name: "Australian Securities Exchange", country: "Australia", flag: "🇦🇺", code: "ASX", currency: "AUD", stocks: 2178 },
  { name: "Euronext Paris", country: "France", flag: "🇫🇷", code: "EPA", currency: "EUR", stocks: 862 },
  { name: "SIX Swiss Exchange", country: "Switzerland", flag: "🇨🇭", code: "SIX", currency: "CHF", stocks: 267 },
  { name: "Euronext Amsterdam", country: "Netherlands", flag: "🇳🇱", code: "AMS", currency: "EUR", stocks: 148 },
  { name: "Stockholm Stock Exchange", country: "Sweden", flag: "🇸🇪", code: "STO", currency: "SEK", stocks: 1025 },
  { name: "Oslo Stock Exchange", country: "Norway", flag: "🇳🇴", code: "OSE", currency: "NOK", stocks: 285 },
  { name: "Copenhagen Stock Exchange", country: "Denmark", flag: "🇩🇰", code: "CPH", currency: "DKK", stocks: 172 },
  { name: "Helsinki Stock Exchange", country: "Finland", flag: "🇫🇮", code: "HEL", currency: "EUR", stocks: 165 },
  { name: "Johannesburg Stock Exchange", country: "South Africa", flag: "🇿🇦", code: "JSE", currency: "ZAR", stocks: 354 },
  { name: "Taiwan Stock Exchange", country: "Taiwan", flag: "🇹🇼", code: "TWSE", currency: "TWD", stocks: 970 },
  { name: "Singapore Exchange", country: "Singapore", flag: "🇸🇬", code: "SGX", currency: "SGD", stocks: 652 },
  { name: "Bursa Malaysia", country: "Malaysia", flag: "🇲🇾", code: "KLSE", currency: "MYR", stocks: 945 },
  { name: "Stock Exchange of Thailand", country: "Thailand", flag: "🇹🇭", code: "SET", currency: "THB", stocks: 782 },
  { name: "Jakarta Stock Exchange", country: "Indonesia", flag: "🇮🇩", code: "IDX", currency: "IDR", stocks: 793 },
  { name: "Philippine Stock Exchange", country: "Philippines", flag: "🇵🇭", code: "PSE", currency: "PHP", stocks: 275 },
  { name: "Mexican Stock Exchange", country: "Mexico", flag: "🇲🇽", code: "BMV", currency: "MXN", stocks: 144 },
  { name: "B3 — Brasil Bolsa Balcão", country: "Brazil", flag: "🇧🇷", code: "B3", currency: "BRL", stocks: 383 },
  { name: "Buenos Aires Stock Exchange", country: "Argentina", flag: "🇦🇷", code: "BCBA", currency: "ARS", stocks: 98 },
  { name: "Santiago Stock Exchange", country: "Chile", flag: "🇨🇱", code: "BCS", currency: "CLP", stocks: 207 },
  { name: "Colombia Stock Exchange", country: "Colombia", flag: "🇨🇴", code: "BVC", currency: "COP", stocks: 63 },
  { name: "Lima Stock Exchange", country: "Peru", flag: "🇵🇪", code: "BVL", currency: "PEN", stocks: 228 },
  { name: "Madrid Stock Exchange", country: "Spain", flag: "🇪🇸", code: "BME", currency: "EUR", stocks: 188 },
  { name: "Borsa Italiana", country: "Italy", flag: "🇮🇹", code: "BIT", currency: "EUR", stocks: 405 },
  { name: "Vienna Stock Exchange", country: "Austria", flag: "🇦🇹", code: "VIE", currency: "EUR", stocks: 88 },
  { name: "Warsaw Stock Exchange", country: "Poland", flag: "🇵🇱", code: "WSE", currency: "PLN", stocks: 432 },
  { name: "Prague Stock Exchange", country: "Czech Republic", flag: "🇨🇿", code: "PSE", currency: "CZK", stocks: 52 },
  { name: "Budapest Stock Exchange", country: "Hungary", flag: "🇭🇺", code: "BUX", currency: "HUF", stocks: 45 },
  { name: "Istanbul Stock Exchange", country: "Turkey", flag: "🇹🇷", code: "BIST", currency: "TRY", stocks: 510 },
  { name: "Tel Aviv Stock Exchange", country: "Israel", flag: "🇮🇱", code: "TASE", currency: "ILS", stocks: 476 },
  { name: "Saudi Stock Exchange", country: "Saudi Arabia", flag: "🇸🇦", code: "TADAWUL", currency: "SAR", stocks: 282 },
  { name: "Qatar Stock Exchange", country: "Qatar", flag: "🇶🇦", code: "QSE", currency: "QAR", stocks: 48 },
  { name: "Abu Dhabi Securities Exchange", country: "UAE", flag: "🇦🇪", code: "ADX", currency: "AED", stocks: 73 },
  { name: "Dubai Financial Market", country: "UAE", flag: "🇦🇪", code: "DFM", currency: "AED", stocks: 67 },
  { name: "Nairobi Securities Exchange", country: "Kenya", flag: "🇰🇪", code: "NSE", currency: "KES", stocks: 65 },
  { name: "Nigerian Stock Exchange", country: "Nigeria", flag: "🇳🇬", code: "NGX", currency: "NGN", stocks: 156 },
  { name: "Casablanca Stock Exchange", country: "Morocco", flag: "🇲🇦", code: "CSE", currency: "MAD", stocks: 76 },
  { name: "Egyptian Exchange", country: "Egypt", flag: "🇪🇬", code: "EGX", currency: "EGP", stocks: 253 },
  { name: "New Zealand Exchange", country: "New Zealand", flag: "🇳🇿", code: "NZX", currency: "NZD", stocks: 183 },
];

const columns: ColumnDef<Exchange, any>[] = [
  {
    accessorKey: "name",
    header: "Exchange Name",
    cell: ({ row }) => {
      const name = row.original.name;
      const url = EXCHANGE_WEBSITES[name] ?? `https://www.google.com/search?q=${encodeURIComponent(name + " stock exchange official site")}`;
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent-blue font-medium cursor-pointer hover:underline text-[0.875rem]"
        >
          {name}
        </a>
      );
    },
  },
  {
    accessorKey: "country",
    header: "Country",
    cell: ({ row }) => (
      <span className="text-[0.875rem]">
        {row.original.flag} {row.original.country}
      </span>
    ),
  },
  {
    accessorKey: "code",
    header: "Code",
    cell: ({ getValue }) => <span className="text-[0.875rem]">{getValue() as string}</span>,
  },
  {
    accessorKey: "currency",
    header: "Currency",
    cell: ({ getValue }) => <span className="text-[0.875rem]">{getValue() as string}</span>,
  },
  {
    accessorKey: "stocks",
    header: () => <span className="flex justify-end">Stocks</span>,
    cell: ({ getValue }) => (
      <span className="flex justify-end text-[0.875rem]">{(getValue() as number).toLocaleString()}</span>
    ),
  },
];

export default function StockExchangesPage() {
  const [sorting, setSorting] = useState<SortingState>([{ id: "stocks", desc: true }]);
  const [email, setEmail] = useState("");

  const table = useReactTable({
    data: EXCHANGES,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="min-h-screen flex flex-col">
      <div className="max-w-7xl mx-auto w-full px-4 py-6 flex-1">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 text-[0.8125rem] text-muted-foreground mb-4">
          <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
          <span>»</span>
          <span>Lists</span>
          <span>»</span>
          <span className="text-foreground">Stock Exchanges</span>
        </nav>

        {/* Page Header */}
        <h1 className="text-[1.375rem] font-bold font-display text-foreground mb-2">List of Stock Exchanges</h1>
        <div className="flex items-start gap-2 mb-6 text-[0.875rem] text-muted-foreground">
          <Info className="h-4 w-4 text-accent-blue mt-0.5 shrink-0" />
          <span>The table below shows a list of all the active stock exchanges around the world.</span>
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col md:flex-row gap-6">
          {/* Main Content */}
          <div className="flex-1 min-w-0">
            <p className="text-[0.875rem] text-muted-foreground mb-3">
              <span className="font-semibold text-foreground">{EXCHANGES.length} Exchanges</span>
            </p>

            {/* Table */}
            <div className="border border-border rounded-[var(--radius)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b border-border bg-muted/40">
                        {hg.headers.map((header) => (
                          <th
                            key={header.id}
                            className="text-[0.8125rem] font-semibold text-muted-foreground px-3 py-2.5 text-left cursor-pointer select-none hover:text-foreground transition-colors"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <div className="flex items-center gap-1">
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {header.column.getIsSorted() === "asc" && <ChevronUp className="h-3.5 w-3.5" />}
                              {header.column.getIsSorted() === "desc" && <ChevronDown className="h-3.5 w-3.5" />}
                            </div>
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row) => (
                      <tr key={row.id} className="border-b border-border last:border-0 hover:bg-surface transition-colors">
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id} className="px-3 py-2.5">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Back to Top */}
            <div className="flex justify-center py-6">
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="text-[0.8125rem] text-accent-blue hover:underline flex items-center gap-1"
              >
                <ArrowUp className="h-3.5 w-3.5" /> Back to Top
              </button>
            </div>
          </div>

          {/* Right Sidebar */}
          <aside className="w-full md:w-[280px] shrink-0 flex flex-col gap-4">
            {/* Pro Promo */}
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[0.9375rem] font-bold text-foreground mb-1">HedgeFun Pro</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">
                Upgrade now for unlimited access to all data and tools.
              </p>
              <Button className="w-full bg-accent-blue hover:bg-accent-blue-hover text-white text-[0.8125rem]" asChild>
                <Link to="/pro">Sign Up Today</Link>
              </Button>
            </div>

            {/* Newsletter */}
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[0.9375rem] font-bold text-foreground mb-1">Market Newsletter</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">
                Get a daily email with the top market news in bullet point format.
              </p>
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mb-2 h-9 text-[0.8125rem]"
              />
              <Button className="w-full bg-accent-blue hover:bg-accent-blue-hover text-white text-[0.8125rem]">
                Subscribe
              </Button>
            </div>

            {/* Watchlist */}
            <div className="border border-border rounded-[var(--radius)] p-4">
              <h3 className="text-[0.9375rem] font-bold text-foreground mb-1">Watchlist</h3>
              <p className="text-[0.8125rem] text-muted-foreground mb-3">
                Keep track of all your favorite stocks in real-time.
              </p>
              <Button variant="outline" className="w-full text-accent-blue border-accent-blue hover:bg-accent-blue/5 text-[0.8125rem]" asChild>
                <Link to="/watchlist">Sign Up Free</Link>
              </Button>
            </div>

            {/* Ad Banner */}
            <div className="border border-border rounded-[var(--radius)] overflow-hidden" style={{ minHeight: 250 }}>
              <AdBanner />
            </div>
          </aside>
        </div>
      </div>

      <AdBanner />
      
    </div>
  );
}
