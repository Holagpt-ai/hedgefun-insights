import { useCalendarTickerPreview } from "@/hooks/useCalendarTickerPreview";
import { V2IntradayChart } from "@/components/watchlist-v2/V2IntradayChart";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";

interface Props {
  symbol: string;
  event: CalendarV4Event | null;
  mobileSheet?: boolean;
  onViewFullChart: () => void;
}

export function CalendarTickerPreview({ symbol, event, mobileSheet, onViewFullChart }: Props) {
  const { snapshot, details, sparkline, isLoading } = useCalendarTickerPreview(symbol, !!symbol);
  const price = snapshot?.day?.c ?? snapshot?.prevDay?.c;
  const change = snapshot?.todaysChangePerc ?? snapshot?.change_percent;
  const bars = sparkline;

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-extrabold">{symbol}</p>
          <p className="text-xs text-muted-foreground">{details?.name ?? event?.companyName}</p>
        </div>
        {isLoading ? (
          <Skeleton className="h-5 w-16" />
        ) : (
          <div className="text-right">
            <p className="text-sm font-bold">{price != null ? `$${Number(price).toFixed(2)}` : "—"}</p>
            <p className={change != null && change >= 0 ? "text-xs text-green-600" : "text-xs text-red-600"}>
              {change != null ? `${change >= 0 ? "+" : ""}${Number(change).toFixed(2)}%` : "—"}
            </p>
          </div>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground mt-1">Delayed quote · not for live trading</p>
      <div className="cal-spark mt-2">
        {bars.length > 1 ? <V2IntradayChart bars={bars} /> : null}
      </div>
      {event?.title ? (
        <p className="text-xs mt-2 line-clamp-2">
          <span className="font-bold">Catalyst:</span> {event.title}
        </p>
      ) : null}
      <Button size="sm" className="w-full mt-3 h-8" onClick={onViewFullChart}>
        View full chart
      </Button>
    </>
  );

  if (mobileSheet) {
    return <div className="cal-preview-sheet">{body}</div>;
  }

  return <div className="cal-preview-popover">{body}</div>;
}