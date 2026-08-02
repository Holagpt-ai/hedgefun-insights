import { useEffect, useState } from "react";
import { resolveMarketClock, type MarketClockState } from "@/lib/market-calendar";

function computeClockState(): MarketClockState {
  return resolveMarketClock(new Date());
}

export function MarketCountdownClock() {
  const [state, setState] = useState(computeClockState);

  useEffect(() => {
    const id = setInterval(() => setState(computeClockState()), 1000);
    return () => clearInterval(id);
  }, []);

  const dotClass =
    state.dot === "green"
      ? "bg-green-500"
      : state.dot === "amber"
      ? "bg-amber-400"
      : "bg-muted-foreground/40";

  return (
    <div className="flex items-center justify-between gap-6 rounded-lg border border-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${dotClass}`} />
          <span className="text-[11px] font-semibold tracking-wider text-muted-foreground">
            {state.label}
          </span>
        </div>
        <div className="text-3xl font-bold tabular-nums tracking-tight">
          {state.countdown}
        </div>
        <p className="text-xs text-muted-foreground">{state.subLabel}</p>
      </div>

      <div className="flex flex-col items-end gap-1">
        <p className="text-[11px] font-semibold tracking-wider text-muted-foreground">
          New York · ET
        </p>
        <div className="text-xl font-semibold tabular-nums text-foreground/80">
          {state.etTimeStr}
        </div>
      </div>
    </div>
  );
}
