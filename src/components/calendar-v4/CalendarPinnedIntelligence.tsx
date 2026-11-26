import { Loader2, Star, NotebookPen, LineChart, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { V2IntradayChart } from "@/components/watchlist-v2/V2IntradayChart";
import { useCalendarTickerPreview } from "@/hooks/useCalendarTickerPreview";
import { useCalendarCachedIntelligence } from "@/hooks/useCalendarCachedIntelligence";
import { isCachedAnalysisRelevantForCalendarDay } from "@/lib/calendar-v4/calendar-ai-relevance";
import type { CalendarV4Event } from "@/lib/calendar-v4/contract";
import { buildCalendarAiAnalystHref, buildCalendarAiHandoffContext } from "@/lib/calendar-v4/ai-handoff";
import { buildCalendarJournalHref } from "@/lib/calendar-v4/journal-handoff";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { Link } from "react-router-dom";
import { providerDayVolume } from "@/lib/market-session";
import { cn } from "@/lib/utils";

interface Props {
  symbol: string | null;
  event: CalendarV4Event | null;
  onOpenChart: () => void;
}

export function CalendarPinnedIntelligence({ symbol, event, onOpenChart }: Props) {
  const upper = symbol?.toUpperCase() ?? "";
  const { snapshot, details, sparkline, isLoading, isError } = useCalendarTickerPreview(upper, !!upper);
  const eventDate = event?.eventDate ?? "";
  const { data: analysis = {}, isLoading: intelLoading } = useCalendarCachedIntelligence(
    upper ? [upper] : [],
    eventDate,
  );
  const { add, isAdded } = useAddToWatchlist();

  const cachedRow = upper ? analysis[upper] : undefined;
  const cached =
    cachedRow && isCachedAnalysisRelevantForCalendarDay(eventDate, cachedRow.analyzed_at)
      ? cachedRow
      : undefined;
  const price = snapshot?.day?.c ?? snapshot?.prevDay?.c;
  const change = snapshot?.todaysChangePerc ?? snapshot?.change_percent;
  const volume = snapshot ? providerDayVolume(snapshot as never) : null;
  const vwap = (snapshot as { day?: { vw?: number } } | undefined)?.day?.vw ?? null;
  const obs = (snapshot as { updated?: number } | undefined)?.updated;

  if (!upper) {
    return (
      <aside className="cal-panel cal-pin-panel" aria-label="Pinned ticker intelligence">
        <div className="cal-spot-head">
          <Sparkles className="h-3.5 w-3.5" />
          PINNED TICKER
        </div>
        <p className="cal-pin-empty">Select a ticker from the day agenda, month chips, or search to pin intelligence here.</p>
      </aside>
    );
  }

  const handoff = event
    ? buildCalendarAiHandoffContext(
        event,
        obs ? new Date(obs).toISOString() : null,
        upper,
      )
    : null;

  return (
    <aside className="cal-panel cal-pin-panel" aria-label={`Pinned ticker ${upper}`}>
      <div className="cal-spot-head">
        <Sparkles className="h-3.5 w-3.5" />
        PINNED TICKER
      </div>
      <div className="cal-tcard">
        <div className="cal-tname">
          {details?.name ?? event?.companyName ?? upper}
          <span className="cal-tsym">{upper}</span>
        </div>
        <div className="cal-tprice-row">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <span className="cal-tprice">{price != null ? `$${Number(price).toFixed(2)}` : "—"}</span>
              <span className={cn("cal-tchg", (change ?? 0) >= 0 ? "up" : "down")}>
                {change != null ? `${change >= 0 ? "+" : ""}${Number(change).toFixed(2)}%` : "—"}
              </span>
            </>
          )}
        </div>
        <p className="cal-tclosed text-xs text-muted-foreground">
          {obs ? `As of ${new Date(obs).toLocaleString()}` : isError ? "Quote unavailable" : "Delayed market data"}
        </p>
        <div className="cal-tchart">
          {sparkline.length > 1 ? <V2IntradayChart bars={sparkline} height={72} vwap={vwap} priorClose={snapshot?.prevDay?.c ?? null} /> : null}
        </div>
        <dl className="cal-tstats">
          <div className="stat">
            <dt>Volume</dt>
            <dd>{volume != null ? volume.toLocaleString() : "—"}</dd>
          </div>
          <div className="stat">
            <dt>VWAP</dt>
            <dd>{vwap != null ? `$${Number(vwap).toFixed(2)}` : "—"}</dd>
          </div>
          <div className="stat">
            <dt>Prev close</dt>
            <dd>{snapshot?.prevDay?.c != null ? `$${Number(snapshot.prevDay.c).toFixed(2)}` : "—"}</dd>
          </div>
        </dl>
        {event ? (
          <p className="cal-tai">
            <Sparkles className="h-4 w-4 shrink-0" />
            <span>
              <b>Catalyst:</b> {event.title}
              {event.sourceUrl ? (
                <>
                  {" "}
                  ·{" "}
                  <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="font-semibold">
                    Source
                  </a>
                </>
              ) : null}
            </span>
          </p>
        ) : null}
        {cached?.summary ? (
          <p className="text-xs text-muted-foreground border border-border rounded-lg p-2 mt-2">
            <span className="font-bold text-foreground">Cached watchlist analysis</span> ({cached.analyzed_at.slice(0, 16).replace("T", " ")} UTC): {cached.summary}
          </p>
        ) : intelLoading ? (
          <p className="text-xs text-muted-foreground mt-2">Checking cached analysis…</p>
        ) : null}
        <div className="flex flex-wrap gap-1.5 mt-3">
          <Button variant="outline" size="sm" className="h-8 gap-1" onClick={onOpenChart}>
            <LineChart className="h-3.5 w-3.5" />
            Full chart
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => add(upper)} disabled={isAdded(upper)}>
            <Star className="h-3.5 w-3.5" />
            {isAdded(upper) ? "On watchlist" : "Watchlist"}
          </Button>
          {event ? (
            <Button asChild variant="outline" size="sm" className="h-8 gap-1">
              <Link to={buildCalendarJournalHref({ symbol: upper, eventTitle: event.title, eventDate: event.eventDate })}>
                <NotebookPen className="h-3.5 w-3.5" />
                Journal
              </Link>
            </Button>
          ) : null}
          {handoff ? (
            <Button asChild variant="ghost" size="sm" className="h-8">
              <Link to={buildCalendarAiAnalystHref(handoff, event.status)}>AI Analyst</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}