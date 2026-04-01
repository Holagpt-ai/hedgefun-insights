import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { resolveCurrentPrice, resolveMarketSession, resolveSessionLabel, estDate, estTime } from "@/lib/price-utils";

const EXCHANGE_MAP: Record<string, string> = {
  XNAS: "NASDAQ", XNYS: "NYSE", XASE: "NYSE American", ARCX: "NYSE Arca", BATS: "CBOE BZX",
};

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

  const session = resolveMarketSession();
  const prevClose = snapshot?.prevDay?.c ?? 0;
  const dayClose = snapshot?.day?.c > 0 ? snapshot.day.c : 0;
  const livePrice = snapshot?.min?.c > 0 ? snapshot.min.c : (snapshot?.lastTrade?.p > 0 ? snapshot.lastTrade.p : 0);

  // Main (large) price depends on session
  let mainPrice: number;
  let mainChange: number;
  let mainChangePct: number;
  if (session === "pre-market") {
    mainPrice = prevClose > 0 ? prevClose : resolveCurrentPrice(snapshot);
    mainChange = snapshot?.todaysChange ?? 0;
    mainChangePct = snapshot?.todaysChangePerc ?? 0;
  } else {
    mainPrice = resolveCurrentPrice(snapshot);
    mainChange = snapshot?.todaysChange ?? 0;
    mainChangePct = snapshot?.todaysChangePerc ?? 0;
  }
  const positive = mainChange >= 0;

  // Extended-hours secondary line
  const refPrice = session === "pre-market" ? prevClose : dayClose;
  const ahPrice = livePrice > 0 ? livePrice : null;
  const ahChange = ahPrice != null && refPrice > 0 ? ahPrice - refPrice : null;
  const ahChangePct = ahChange != null && refPrice > 0 ? (ahChange / refPrice) * 100 : null;
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
          ${(isPreIPO && details?.offer_price ? details.offer_price : mainPrice).toFixed(2)}
        </span>
        {isPreIPO && details?.offer_price ? (
          <span className="text-sm text-muted-foreground">Expected offer price</span>
        ) : (
          <span className={cn("text-sm font-medium tabular-nums", positive ? "price-positive" : "price-negative")}>
            {positive ? "+" : ""}{mainChange.toFixed(2)} ({positive ? "+" : ""}{mainChangePct.toFixed(2)}%)
          </span>
        )}
      </div>
      {isPreIPO && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted border border-border text-[0.75rem] text-muted-foreground mt-2">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
          IPO Filed — Not Yet Trading
        </div>
      )}
      {!isPreIPO && session === "market" && (
        <p className="text-[0.8125rem] text-muted-foreground mt-0.5">
          At close: {estDate()}, 4:00 PM EDT
        </p>
      )}
      {!isPreIPO && (session === "pre-market" || session === "after-hours") && ahPrice != null && ahChange != null && ahChangePct != null && (
        <div className="flex items-center gap-1.5 mt-1 text-xs flex-wrap">
          <span className="text-muted-foreground">{session === "pre-market" ? "☀️" : "🌙"} {sessionLabel}:</span>
          <span className="tabular-nums font-medium text-foreground">${ahPrice.toFixed(2)}</span>
          <span className={cn("tabular-nums font-medium", ahPositive ? "price-positive" : "price-negative")}>
            {ahPositive ? "▲" : "▼"} {ahPositive ? "+" : ""}{ahChange.toFixed(2)} ({ahPositive ? "+" : ""}{ahChangePct.toFixed(2)}%)
          </span>
          <span className="text-muted-foreground">· {estDate()}, {estTime()} EDT</span>
        </div>
      )}
      <span className="text-xs text-muted-foreground">Powered by Massive</span>
    </div>
  );
}
