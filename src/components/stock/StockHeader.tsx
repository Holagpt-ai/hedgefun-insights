import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  estDate,
  estTime,
  resolveMarketSession,
  resolveStockHeaderPriceState,
  stockHeaderSessionContext,
} from "@/lib/price-utils";
import StockCtaButtons from "@/components/stock/StockCtaButtons";


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

  const companyName = details?.name ?? ticker;
  const exchange = details?.primary_exchange ?? "";
  const exchangeLabel = EXCHANGE_MAP[exchange] || exchange;

  const session = resolveMarketSession();
  const header = resolveStockHeaderPriceState(snapshot, session);
  const mainPrice = header.displayedPrice;
  const mainChange = header.change;
  const mainChangePct = header.changePercent;
  const showMove = mainPrice != null && mainChange != null && mainChangePct != null;
  const positive = (mainChange ?? 0) >= 0;
  const sessionContext = stockHeaderSessionContext(header);

  return (
    <div className="px-4 pt-4 pb-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col min-w-0 flex-1">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-xl font-bold text-foreground">{companyName}</h1>
        <span className="text-accent-blue text-sm font-semibold">({ticker})</span>
        {exchangeLabel && (
          <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{exchangeLabel}</span>
        )}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="text-2xl font-bold text-foreground tabular-nums">
          {isPreIPO && details?.offer_price
            ? `$${Number(details.offer_price).toFixed(2)}`
            : mainPrice != null
              ? `$${mainPrice.toFixed(2)}`
              : "—"}
        </span>
        {isPreIPO && details?.offer_price ? (
          <span className="text-sm text-muted-foreground">Expected offer price</span>
        ) : showMove && mainChange != null && mainChangePct != null ? (
          <span className={cn("text-sm font-medium tabular-nums", positive ? "price-positive" : "price-negative")}>
            {positive ? "+" : ""}{mainChange.toFixed(2)} ({positive ? "+" : ""}{mainChangePct.toFixed(2)}%)
          </span>
        ) : null}
      </div>
      {isPreIPO && (
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted border border-border text-[0.75rem] text-muted-foreground mt-2">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 inline-block" />
          IPO Filed — Not Yet Trading
        </div>
      )}
      {!isPreIPO && session === "market" && (
        <p className="text-[0.8125rem] text-muted-foreground mt-0.5">
          {estDate()}, {estTime()} EDT · Market open
        </p>
      )}
      {!isPreIPO && sessionContext && (
        <p className="text-xs text-muted-foreground mt-1">
          {sessionContext} · {estDate()}, {estTime()} EDT
        </p>
      )}
        </div>
        {!loading && (
          <div className="flex gap-2 shrink-0 pt-1">
            <StockCtaButtons ticker={ticker} />
          </div>
        )}
      </div>
    </div>
  );
}
