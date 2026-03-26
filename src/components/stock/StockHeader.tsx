import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const EXCHANGE_MAP: Record<string, string> = {
  XNAS: "NASDAQ", XNYS: "NYSE", XASE: "NYSE American", ARCX: "NYSE Arca", BATS: "CBOE BZX",
};

function isAfterHours(): boolean {
  const est = new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
  const day = est.getDay();
  if (day === 0 || day === 6) return true;
  return est.getHours() * 60 + est.getMinutes() >= 960;
}

function estDate(): string {
  return new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
}

function estTime(): string {
  return new Date().toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });
}

interface Props {
  snapshot: any;
  details: any;
  loading: boolean;
  ticker: string;
  isPreIPO?: boolean;
}

export default function StockHeader({ snapshot, details, loading, ticker, isPreIPO }: Props) {
  if (loading) {
    return (
      <div className="px-4 pt-4 pb-2 space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-4 w-56" />
      </div>
    );
  }

  const price = snapshot?.day?.c ?? snapshot?.lastTrade?.p ?? 0;
  const change = snapshot?.todaysChange ?? 0;
  const changePct = snapshot?.todaysChangePerc ?? 0;
  const positive = change >= 0;
  const companyName = details?.name ?? ticker;
  const exchange = details?.primary_exchange ?? "";
  const exchangeLabel = EXCHANGE_MAP[exchange] || exchange;

  const displayPrice = isPreIPO && details?.offer_price
    ? details.offer_price
    : price;

  const afterHours = isAfterHours();
  const ahPrice = snapshot?.lastTrade?.p ?? snapshot?.lastQuote?.P ?? snapshot?.prevDay?.c ?? null;
  const ahChange = ahPrice != null && price ? ahPrice - price : null;
  const ahChangePct = ahChange != null && price ? (ahChange / price) * 100 : null;
  const ahPositive = (ahChange ?? 0) >= 0;

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl font-bold text-foreground">{companyName}</h1>
        <span className="text-accent-blue text-sm font-semibold">({ticker})</span>
        {exchangeLabel && (
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{exchangeLabel}</span>
        )}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-2xl font-bold text-foreground tabular-nums">
          {isPreIPO && details?.offer_price ? `$${displayPrice.toFixed(2)}` : `$${displayPrice.toFixed(2)}`}
        </span>
        {isPreIPO && details?.offer_price ? (
          <span className="text-sm text-muted-foreground">Expected offer price</span>
        ) : (
          <span className={cn("text-sm font-medium tabular-nums", positive ? "price-positive" : "price-negative")}>
            {positive ? "+" : ""}{change.toFixed(2)} ({positive ? "+" : ""}{changePct.toFixed(2)}%)
          </span>
        )}
      </div>
      {isPreIPO && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted border border-border text-[0.75rem] text-muted-foreground mt-2">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
          IPO Filed — Not Yet Trading
        </div>
      )}
      {!isPreIPO && (
        <p className="text-[0.8125rem] text-muted-foreground mt-0.5">
          At close: {estDate()}, 4:00 PM EDT
        </p>
      )}
      {!isPreIPO && afterHours && ahPrice != null && ahChange != null && ahChangePct != null && (
        <div className="flex items-center gap-1.5 mt-1 text-xs flex-wrap">
          <span className="tabular-nums font-medium text-foreground">${ahPrice.toFixed(2)}</span>
          <span className={cn("tabular-nums font-medium", ahPositive ? "price-positive" : "price-negative")}>
            {ahPositive ? "▲" : "▼"} {ahPositive ? "+" : ""}{ahChange.toFixed(2)} ({ahPositive ? "+" : ""}{ahChangePct.toFixed(2)}%)
          </span>
          <span className="text-muted-foreground">🌙 After-hours · {estDate()}, {estTime()} EDT</span>
        </div>
      )}
      <span className="text-xs text-muted-foreground">Powered by Massive</span>
    </div>
  );
}
