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
};

export default function MarketTicker() {
  const { data, isLoading } = useQuery({
    queryKey: ["market-ticker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("market_indexes")
        .select("symbol, name, current_value, change_percent");
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
    <div className="w-full bg-surface-card border-b border-border h-[36px] overflow-hidden flex items-center">
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
  );
}
