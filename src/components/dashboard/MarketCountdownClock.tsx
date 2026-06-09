import { useEffect, useState } from "react";
import { MARKET_SESSIONS, MarketSession, DotColor } from "@/config/inbox.config";

interface ClockState {
  label: string;
  dot: DotColor;
  countdown: string;
  subLabel: string;
  etTimeStr: string;
}

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

function getETDate(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}

function findActiveSession(totalMins: number): MarketSession {
  for (const sess of MARKET_SESSIONS) {
    if (
      sess.rangeStart !== null &&
      sess.rangeEnd !== null &&
      totalMins >= sess.rangeStart &&
      totalMins <= sess.rangeEnd
    ) {
      return sess;
    }
  }
  return MARKET_SESSIONS[MARKET_SESSIONS.length - 1];
}

function computeClockState(): ClockState {
  const et = getETDate();
  const h = et.getHours();
  const m = et.getMinutes();
  const s = et.getSeconds();
  const totalMins = h * 60 + m;
  const etTimeStr = `${pad(h)}:${pad(m)}:${pad(s)}`;

  const active = findActiveSession(totalMins);

  let countdown = "--:--:--";
  if (active.countdownTargetMins !== null) {
    const totalSecs = Math.max(
      (active.countdownTargetMins - totalMins) * 60 - s,
      0
    );
    const dh = Math.floor(totalSecs / 3600);
    const dm = Math.floor((totalSecs % 3600) / 60);
    const ds = totalSecs % 60;
    countdown = `${pad(dh)}:${pad(dm)}:${pad(ds)}`;
  }

  return { label: active.label, dot: active.dot, countdown, subLabel: active.subLabel, etTimeStr };
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
