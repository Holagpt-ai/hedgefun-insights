import { useEffect, useState } from "react";
import { resolveMarketClock } from "@/lib/market-calendar";
import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";
import type { MarketSessionId } from "@/config/inbox.config";
import { cn } from "@/lib/utils";

const SESSION_PILL: Record<
  MarketSessionId,
  { shell: string; dot: string; text: string }
> = {
  closed: {
    shell: "border-[#f3c1bb] bg-[#fdecea] dark:border-red-900/50 dark:bg-red-950/40",
    dot: "bg-[#d43a2f]",
    text: "text-[#8c2b23] dark:text-red-200",
  },
  "pre-market": {
    shell: "border-[#ecd9a0] bg-[#fdf3e0] dark:border-amber-900/50 dark:bg-amber-950/35",
    dot: "bg-[#b7791f]",
    text: "text-[#7a5410] dark:text-amber-200",
  },
  market: {
    shell: "border-[#bfe8d2] bg-[#e6f6ee] dark:border-emerald-900/50 dark:bg-emerald-950/35",
    dot: "bg-[#0a8a4d]",
    text: "text-[#0a5c36] dark:text-emerald-200",
  },
  "after-hours": {
    shell: "border-[#ecd9a0] bg-[#fdf3e0] dark:border-amber-900/50 dark:bg-amber-950/35",
    dot: "bg-[#b7791f]",
    text: "text-[#7a5410] dark:text-amber-200",
  },
};

const SHORT_LABEL: Record<MarketSessionId, string> = {
  closed: "Markets closed",
  "pre-market": "Pre-market",
  market: "Regular session",
  "after-hours": "After-hours",
};

function compactSessionLine(clock: ReturnType<typeof resolveMarketClock>): string {
  const label = SHORT_LABEL[clock.sessionId];
  const parts = [label];
  if (clock.countdown) {
    parts.push(clock.sessionId === "closed" ? `opens in ${clock.countdown}` : `ends in ${clock.countdown}`);
  } else if (clock.subLabel) {
    parts.push(clock.subLabel.replace(/^Next session: /, ""));
  }
  return parts.join(" · ");
}

/** Compact header market-status pill — Muse mkt-pill pattern. */
export function HomepageSessionChip({ className }: { className?: string }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const clock = resolveMarketClock(now);
  const theme = SESSION_PILL[clock.sessionId];
  const line = compactSessionLine(clock);
  const tooltip = [line, clock.subLabel, PUBLIC_MARKET_DATA_DELAY_DISCLOSURE].filter(Boolean).join(" · ");

  return (
    <div
      className={cn(
        "hp-mkt-pill inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none shadow-none outline-none sm:px-3 sm:py-1.5 sm:text-xs",
        theme.shell,
        theme.text,
        className,
      )}
      title={tooltip}
      aria-label={tooltip}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full", theme.dot)} aria-hidden />
      <span className="min-w-0 truncate font-semibold">{line}</span>
    </div>
  );
}