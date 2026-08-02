import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface EarningsEvent {
  id: string;
  symbol: string;
  company_name: string;
  report_date: string;
  estimate_eps: number | null;
  actual_eps: number | null;
  surprise_percent: number | null;
  time_of_day: "before_open" | "after_close" | "during";
}

interface EarningsCardsGridProps {
  briefType: "am" | "pm";
}

/**
 * Absolute, calendar-anchored label for an earnings card.
 *
 * `report_date` is a date-only U.S. market calendar value ("YYYY-MM-DD"); it is
 * formatted via UTC so the browser timezone can never shift the day. The data
 * contract exposes only a session (`time_of_day`), never an exact clock time,
 * so no specific event time is invented.
 *
 * Returns null for missing/invalid dates so the caller can render an honest
 * unavailable state instead of a guessed date.
 */
export function formatEarningsEventLabel(
  reportDate: string | null | undefined,
  timeOfDay: EarningsEvent["time_of_day"] | null | undefined,
): string | null {
  if (typeof reportDate !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(reportDate.trim());
  if (!match) return null;

  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(utc.getTime()) ||
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }

  const datePart = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(utc);

  const sessionPart =
    timeOfDay === "before_open"
      ? "Before open ET"
      : timeOfDay === "after_close"
        ? "After close ET"
        : timeOfDay === "during"
          ? "During market hours ET"
          : "Session TBD ET";

  return `${datePart} · ${sessionPart}`;
}

export function EarningsCardsGrid({ briefType }: EarningsCardsGridProps) {
  const { user } = useAuth();
  const [earnings, setEarnings] = useState<EarningsEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEarnings = async () => {
      if (!user) return;
      try {
        const today = new Date().toISOString().split("T")[0];
        const tomorrow = new Date(Date.now() + 86400000).toISOString().split("T")[0];
        const timeFilter = briefType === "am" ? "before_open" : "after_close";

        const { data, error } = await supabase
          .from("earnings_calendar")
          .select("*")
          .eq("time_of_day", timeFilter)
          .in("report_date", [today, tomorrow])
          .order("report_date", { ascending: true })
          .order("symbol", { ascending: true });

        if (error) throw error;
        setEarnings((data as EarningsEvent[]) || []);
      } catch (err) {
        console.error("Failed to fetch earnings:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchEarnings();
  }, [user, briefType]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 rounded-lg border border-border bg-card animate-pulse" />
        ))}
      </div>
    );
  }

  if (earnings.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
        No earnings scheduled for {briefType === "am" ? "this morning" : "this afternoon"}.
      </div>
    );
  }

  const getEarningsStatus = (event: EarningsEvent) => {
    if (event.actual_eps === null) {
      return { label: "TBD", textColor: "text-[#ffaa00]", bgColor: "bg-[#332200]" };
    }
    const pct = event.surprise_percent;
    const showPct = pct !== null && Math.abs(pct) <= 500;
    if ((pct ?? 0) > 0) {
      return {
        label: showPct ? `BEAT +${pct!.toFixed(1)}%` : "BEAT",
        textColor: "text-green-400",
        bgColor: "bg-green-950",
      };
    }
    return {
      label: showPct ? `MISS ${pct!.toFixed(1)}%` : "MISS",
      textColor: "text-red-400",
      bgColor: "bg-red-950",
    };
  };

  const getTimeLabel = (event: EarningsEvent) =>
    formatEarningsEventLabel(event.report_date, event.time_of_day);


  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {earnings.slice(0, 6).map((event) => {
        const status = getEarningsStatus(event);
        return (
          <div
            key={event.id}
            className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{event.symbol}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {event.company_name}
                </div>
              </div>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded ${status.bgColor} ${status.textColor} whitespace-nowrap`}
              >
                {status.label}
              </span>
            </div>
            <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
              <span>Est EPS: ${event.estimate_eps?.toFixed(2) ?? "—"}</span>
              <span>Actual: ${event.actual_eps?.toFixed(2) ?? "TBD"}</span>
              <span className="text-[11px] opacity-70">{getTimeLabel(event)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
