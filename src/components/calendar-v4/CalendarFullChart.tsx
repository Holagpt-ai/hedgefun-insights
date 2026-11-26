import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import StockChart from "@/components/stock/StockChart";
import { fetchChartAggregateBars } from "@/lib/stock-chart/fetch-aggregates";
import { getTickerDetails, getTickerSnapshot } from "@/lib/polygon";
import { CalendarAIPanel } from "@/components/calendar-v4/CalendarAIPanel";
import { buildCalendarJournalHref } from "@/lib/calendar-v4/journal-handoff";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { Star, NotebookPen } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbol: string;
  event: CalendarV4Event | null;
}

export function CalendarFullChart({ open, onOpenChange, symbol, event }: Props) {
  const [timeRange, setTimeRange] = useState(event?.eventDate ? "1D" : "1M");
  const upper = symbol.toUpperCase();
  const { add, isAdded } = useAddToWatchlist();

  const { data: snapshot, isLoading: snapLoading } = useQuery({
    queryKey: ["cal-full-snapshot", upper],
    queryFn: () => getTickerSnapshot(upper),
    enabled: open && !!upper,
    staleTime: 60_000,
  });

  const { data: details } = useQuery({
    queryKey: ["cal-full-details", upper],
    queryFn: () => getTickerDetails(upper),
    enabled: open && !!upper,
    staleTime: 120_000,
  });

  const { data: chartBundle, isLoading: chartLoading } = useQuery({
    queryKey: ["cal-full-chart", upper, timeRange],
    queryFn: () => fetchChartAggregateBars(upper, timeRange),
    enabled: open && !!upper,
    staleTime: 60_000,
  });

  const positive = (snapshot?.todaysChangePerc ?? snapshot?.change_percent ?? 0) >= 0;
  const prevClose = snapshot?.prevDay?.c ?? null;
  const chartData = (chartBundle?.bars ?? []).map((b) => ({ t: b.utcMs, c: b.close }));

  const journalHref = event
    ? buildCalendarJournalHref({ symbol: upper, eventTitle: event.title, eventDate: event.eventDate })
    : `/journal/trades/new?symbol=${encodeURIComponent(upper)}`;
  const quoteObservedAt = snapshot?.updated
    ? new Date(snapshot.updated).toISOString()
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cal-chart-dialog max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {upper}
            {details?.name ? ` · ${details.name}` : ""}
          </DialogTitle>
        </DialogHeader>
        <StockChart
          chartData={chartData}
          chartLoading={chartLoading || snapLoading}
          timeRange={timeRange}
          setTimeRange={setTimeRange}
          positive={positive}
          prevClose={prevClose}
        />
        {event ? (
          <p className="text-xs text-muted-foreground border-l-2 border-[var(--hp-blue,#2563eb)] pl-2">
            Event: {event.title}
            {event.eventTime ? ` · ${event.eventTime.slice(0, 5)} ET` : ""}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => add(upper)} disabled={isAdded(upper)}>
            <Star className="h-3.5 w-3.5" />
            {isAdded(upper) ? "On watchlist" : "Add to watchlist"}
          </Button>
          <Button asChild variant="outline" size="sm" className="h-8 gap-1">
            <Link to={journalHref}>
              <NotebookPen className="h-3.5 w-3.5" />
              Trading journal
            </Link>
          </Button>
        </div>
        <CalendarAIPanel symbol={upper} event={event} quoteObservedAt={quoteObservedAt} />
      </DialogContent>
    </Dialog>
  );
}