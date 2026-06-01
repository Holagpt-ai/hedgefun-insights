import { Skeleton } from "@/components/ui/skeleton";
import { resolveCurrentPrice } from "@/lib/price-utils";

function formatMarketCap(val: number | null): string {
  if (!val || val <= 0) return "n/a";
  if (val >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
  if (val >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
  if (val >= 1e3) return `$${(val / 1e3).toFixed(1)}K`;
  return `$${Math.round(val).toLocaleString()}`;
}

function formatShares(val: number | null): string {
  if (!val) return "n/a";
  if (val >= 1e9) return `${(val / 1e9).toFixed(2)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(2)}M`;
  return val.toLocaleString();
}

function formatVolume(val: number | null): string {
  if (!val) return "n/a";
  if (val >= 1e9) return `${(val / 1e9).toFixed(1)}B`;
  if (val >= 1e6) return `${(val / 1e6).toFixed(1)}M`;
  if (val >= 1e3) return `${(val / 1e3).toFixed(1)}K`;
  return val.toLocaleString();
}

function formatPrice(val: number | null | undefined): string {
  if (val == null) return "n/a";
  return `$${val.toFixed(val < 1 ? 4 : 2)}`;
}

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return "n/a";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const ProBadge = () => (
  <span className="text-[0.625rem] font-semibold bg-accent-blue/10 text-accent-blue px-1.5 py-0.5 rounded ml-1">Pro</span>
);

interface Props {
  snapshot: any;
  details: any;
  dividends: any;
  yearAggs: any;
  loading: boolean;
}

export default function StockStatsTable({ snapshot, details, dividends, yearAggs, loading }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-x-6">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="flex justify-between py-2 border-b border-border">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    );
  }

  // Resolve price with shared fallback chain
  const resolvedPrice = resolveCurrentPrice(snapshot);

  // Market cap with fallback
  const mcRaw = details?.market_cap || (resolvedPrice && details?.share_class_shares_outstanding ? resolvedPrice * details.share_class_shares_outstanding : null);

  // 52-week range from year aggregates
  let week52High: number | null = null;
  let week52Low: number | null = null;
  if (yearAggs && Array.isArray(yearAggs) && yearAggs.length > 0) {
    week52High = Math.max(...yearAggs.map((r: any) => r.h));
    week52Low = Math.min(...yearAggs.map((r: any) => r.l));
  }

  // Dividends
  const divArray = Array.isArray(dividends) ? dividends : [];
  const dividendTtm = divArray.length > 0
    ? `$${divArray.reduce((s: number, d: any) => s + (d.cash_amount ?? 0), 0).toFixed(2)}`
    : "n/a";
  const exDivDate = divArray.length > 0 ? formatDate(divArray[0]?.ex_dividend_date) : "n/a";

  // Day range with fallbacks
  const dayLow = (snapshot?.day?.l > 0 ? snapshot.day.l : null) ?? snapshot?.min?.l ?? snapshot?.prevDay?.l ?? null;
  const dayHigh = (snapshot?.day?.h > 0 ? snapshot.day.h : null) ?? snapshot?.min?.h ?? snapshot?.prevDay?.h ?? null;
  const dayRange = dayLow != null && dayHigh != null
    ? `$${dayLow.toFixed(2)} - $${dayHigh.toFixed(2)}`
    : "n/a";

  // Open with fallback
  const openPrice = (snapshot?.day?.o > 0 ? snapshot.day.o : null) ?? snapshot?.prevDay?.o ?? null;

  const week52Range = week52High != null && week52Low != null
    ? `$${week52Low.toFixed(2)} - $${week52High.toFixed(2)}`
    : "n/a";

  const leftCol = [
    { label: "Market Cap", value: formatMarketCap(mcRaw) },
    { label: "Revenue (ttm)", value: "—", pro: true },
    { label: "Net Income", value: "—", pro: true },
    { label: "EPS", value: "—", pro: true },
    { label: "Shares Out", value: formatShares(details?.share_class_shares_outstanding) },
    { label: "PE Ratio", value: "—", pro: true },
    { label: "Forward PE", value: "n/a" },
    { label: "Analysts", value: "n/a", pro: true },
    { label: "Dividend (ttm)", value: dividendTtm },
    { label: "Ex-Dividend Date", value: exDivDate },
  ];

  // Volume with fallback chain
  const volume = (snapshot?.day?.v > 0 ? snapshot.day.v : null) ?? snapshot?.min?.av ?? snapshot?.min?.v ?? 0;

  const rightCol = [
    { label: "Volume", value: formatVolume(volume || null) },
    { label: "Open", value: formatPrice(snapshot?.day?.o ?? null) },
    { label: "Previous Close", value: formatPrice(snapshot?.prevDay?.c) },
    { label: "High", value: formatPrice(snapshot?.day?.h ?? null) },
    { label: "Low", value: formatPrice(snapshot?.day?.l ?? null) },
    { label: "Day's Range", value: dayRange },
    { label: "52-Week Range", value: week52Range },
    { label: "Beta", value: "n/a", pro: true },
    { label: "Price Target", value: "n/a", pro: true },
    { label: "Earnings Date", value: "n/a" },
  ];

  const maxLen = Math.max(leftCol.length, rightCol.length);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
      <div>
        {leftCol.map((row) => (
          <div key={row.label} className="flex justify-between items-center py-2 border-b border-border text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="text-foreground font-medium tabular-nums">
              {row.value}
              {row.pro && <ProBadge />}
            </span>
          </div>
        ))}
      </div>
      <div>
        {rightCol.map((row) => (
          <div key={row.label} className="flex justify-between items-center py-2 border-b border-border text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="text-foreground font-medium tabular-nums">
              {row.value}
              {row.pro && <ProBadge />}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
