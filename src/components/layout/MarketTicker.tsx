import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// extend as more instruments are seeded
const ORDER = [
  "SPY","QQQ","DIA","IWM","VIXY","GLD","SLV","IBIT","BNO","UNG","TLT","UUP",
];

type IndexRow = {
  symbol: string;
  name: string;
  current_value: number | null;
  change_percent: number | null;
  updated_at: string | null;
};

const FRESHNESS_UNAVAILABLE = "Index data freshness unavailable";

/**
 * Strip-wide freshness disclosure built exclusively from the source rows'
 * existing `updated_at` values. Uses the OLDEST valid timestamp so freshness
 * is never overstated. Never substitutes the current time.
 */
export function formatIndexFreshness(timestamps: (string | null | undefined)[]): string {
  if (!timestamps.length) return FRESHNESS_UNAVAILABLE;

  const parsed: number[] = [];
  for (const ts of timestamps) {
    if (typeof ts !== "string" || ts.trim() === "") return FRESHNESS_UNAVAILABLE;
    const ms = new Date(ts).getTime();
    if (!Number.isFinite(ms)) return FRESHNESS_UNAVAILABLE;
    parsed.push(ms);
  }

  const oldest = new Date(Math.min(...parsed));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(oldest);

  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  const month = get("month");
  const day = get("day");
  const year = get("year");
  const hour = get("hour");
  const minute = get("minute");
  const dayPeriod = get("dayPeriod").toUpperCase();

  if (!weekday || !month || !day || !year || !hour || !minute || !dayPeriod) {
    return FRESHNESS_UNAVAILABLE;
  }

  return `Index data as of ${weekday}, ${month} ${day}, ${year} · ${hour}:${minute} ${dayPeriod} ET`;
}

export default function MarketTicker() {
  const { data, isLoading } = useQuery({
    queryKey: ["market-ticker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_indexes")
        .select("symbol, name, current_value, change_percent, updated_at");
      if (error) throw error;
      return (data ?? []) as IndexRow[];
    },
    refetchInterval: 60_000,
  });

  const rows = (data ?? [])
    .filter((r) => ORDER.includes(r.symbol))
    .sort((a, b) => ORDER.indexOf(a.symbol) - ORDER.indexOf(b.symbol));

  if (isLoading || rows.length === 0) {
    return (
      <div className="w-full bg-surface-card border-b border-border h-[36px]" />
    );
  }

  const freshness = formatIndexFreshness(rows.map((r) => r.updated_at));

  const renderItem = (r: IndexRow, idx: number) => {
    const cp = r.change_percent ?? 0;
    const up = cp >= 0;
    return (
      <div
        key={`${r.symbol}-${idx}`}
        className="inline-flex items-center gap-2 px-4 border-r border-border text-xs"
      >
        <span className="font-semibold">{r.name}</span>
        <span className="tabular-nums">
          {r.current_value != null ? Number(r.current_value).toFixed(2) : "—"}
        </span>
        <span
          className={`tabular-nums ${up ? "price-positive text-green-600" : "price-negative text-red-600"}`}
        >
          {up ? "▲" : "▼"} {cp.toFixed(2)}%
        </span>
      </div>
    );
  };

  return (
    <div className="w-full border-b border-border">
      <div className="w-full bg-surface-card h-[36px] overflow-hidden flex items-center">
        {/* width controlled here — adjust px / max-w if alignment needs tuning */}
        <div className="w-full px-4 overflow-hidden">
          <style>{`
            @keyframes hf-ticker-scroll {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            .hf-ticker-scroll {
              display: inline-flex;
              white-space: nowrap;
              animation: hf-ticker-scroll 60s linear infinite;
              will-change: transform;
            }
            .hf-ticker-scroll:hover { animation-play-state: paused; }
          `}</style>
          <div className="hf-ticker-scroll">
            <div className="inline-flex items-center">
              {rows.map((r, i) => renderItem(r, i))}
            </div>
            <div className="inline-flex items-center" aria-hidden="true">
              {rows.map((r, i) => renderItem(r, i + rows.length))}
            </div>
          </div>
        </div>
      </div>
      <p
        className="w-full bg-surface-card px-4 py-1 text-[0.6875rem] leading-tight text-muted-foreground break-words"
        aria-label={freshness}
      >
        {freshness}
      </p>
    </div>
  );
}
