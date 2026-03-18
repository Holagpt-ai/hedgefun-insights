import { useMemo, useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameDay } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Trade } from "@/hooks/useJournalTrades";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface Props {
  trades: Trade[];
}

export function JournalCalendar({ trades }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart); // 0=Sun

  // Map date string -> trades on that day
  const tradesByDate = useMemo(() => {
    const map = new Map<string, Trade[]>();
    trades.forEach((t) => {
      const key = t.entry_date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [trades]);

  // Daily P&L for color coding
  const dailyPnl = useMemo(() => {
    const map = new Map<string, number>();
    trades.forEach((t) => {
      if (t.pnl != null) {
        const key = t.entry_date;
        map.set(key, (map.get(key) ?? 0) + t.pnl);
      }
    });
    return map;
  }, [trades]);

  const fmtCurrency = (v: number) =>
    `${v >= 0 ? "+" : ""}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (trades.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg font-semibold mb-1">No trades yet</p>
        <p className="text-sm">Log some trades to see them on the calendar.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Month nav */}
      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h3 className="text-sm font-semibold text-foreground">{format(currentMonth, "MMMM yyyy")}</h3>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Grid */}
      <div className="border border-border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-7 bg-surface">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
              {d}
            </div>
          ))}
        </div>

        {/* Days grid */}
        <div className="grid grid-cols-7">
          {/* Empty cells for padding */}
          {Array.from({ length: startPad }).map((_, i) => (
            <div key={`pad-${i}`} className="min-h-[90px] border-b border-r border-border-subtle bg-surface/50" />
          ))}

          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayTrades = tradesByDate.get(key) ?? [];
            const pnl = dailyPnl.get(key);
            const isToday = isSameDay(day, new Date());

            return (
              <div key={key} className={cn("min-h-[90px] border-b border-r border-border-subtle p-1.5 relative", isToday && "bg-[hsl(var(--accent-blue-light))]")}>
                {/* Date number */}
                <span className={cn("text-xs tabular-nums", isToday ? "font-bold text-[hsl(var(--accent-blue))]" : "text-muted-foreground")}>
                  {format(day, "d")}
                </span>

                {/* P&L badge */}
                {pnl != null && (
                  <div className={cn(
                    "text-[0.625rem] font-semibold tabular-nums mt-0.5 px-1 py-0.5 rounded",
                    pnl >= 0 ? "bg-[hsl(var(--green-bg))] text-[hsl(var(--green))]" : "bg-[hsl(var(--red-bg))] text-[hsl(var(--red))]"
                  )}>
                    {fmtCurrency(pnl)}
                  </div>
                )}

                {/* Trade dots */}
                {dayTrades.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex gap-0.5 flex-wrap mt-1 w-full text-left">
                        {dayTrades.slice(0, 4).map((t) => (
                          <span key={t.id} className={cn(
                            "inline-block text-[0.5625rem] font-bold px-1 py-px rounded leading-tight",
                            t.side === "buy" ? "bg-[hsl(var(--green-bg))] text-[hsl(var(--green))]" : "bg-[hsl(var(--red-bg))] text-[hsl(var(--red))]"
                          )}>
                            {t.symbol}
                          </span>
                        ))}
                        {dayTrades.length > 4 && (
                          <span className="text-[0.5625rem] text-muted-foreground font-medium">+{dayTrades.length - 4}</span>
                        )}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3 pointer-events-auto" align="start">
                      <p className="text-xs font-semibold text-foreground mb-2">{format(day, "MMM d, yyyy")} — {dayTrades.length} trade{dayTrades.length > 1 ? "s" : ""}</p>
                      <div className="space-y-2">
                        {dayTrades.map((t) => (
                          <div key={t.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className={cn("uppercase font-bold", t.side === "buy" ? "text-[hsl(var(--green))]" : "text-[hsl(var(--red))]")}>{t.side}</span>
                              <span className="font-semibold text-foreground">{t.symbol}</span>
                              <span className="text-muted-foreground">×{t.quantity}</span>
                            </div>
                            {t.pnl != null ? (
                              <span className={cn("font-semibold tabular-nums", t.pnl >= 0 ? "text-[hsl(var(--green))]" : "text-[hsl(var(--red))]")}>
                                {fmtCurrency(t.pnl)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Open</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[hsl(var(--green-bg))] border border-[hsl(var(--green))]" />
          Profitable day
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[hsl(var(--red-bg))] border border-[hsl(var(--red))]" />
          Loss day
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-[hsl(var(--accent-blue-light))] border border-[hsl(var(--accent-blue))]" />
          Today
        </div>
      </div>
    </div>
  );
}
