import { useEffect, useState } from "react";
import { resolveMarketClock } from "@/lib/market-calendar";
import { PUBLIC_MARKET_DATA_DELAY_DISCLOSURE } from "@/lib/price-utils";

function sessionDotClass(sessionId: string): string {
  if (sessionId === "market") return "bg-green-500";
  if (sessionId === "pre-market") return "bg-orange-500";
  if (sessionId === "after-hours") return "bg-amber-500";
  return "bg-red-500";
}

/** Live ET session pill — sole market-status message on the homepage body. */
export function HomepageSessionChip() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const clock = resolveMarketClock(now);
  const label = clock.label;
  const countdown = clock.countdown;
  const sub = clock.subLabel;

  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-full border border-[var(--hp-line)] bg-[var(--hp-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--hp-ink-2)] shadow-sm">
      <span className={`h-2 w-2 rounded-full ${sessionDotClass(clock.sessionId)}`} aria-hidden />
      <span className="text-[var(--hp-ink)]">{label}</span>
      {countdown ? <span className="hp-num text-[var(--hp-ink-2)]">· {countdown}</span> : null}
      {sub ? <span className="text-[var(--hp-ink-3)]">· {sub}</span> : null}
      <span className="w-full text-[10px] font-medium text-[var(--hp-ink-3)] sm:w-auto">
        {PUBLIC_MARKET_DATA_DELAY_DISCLOSURE}
      </span>
    </div>
  );
}