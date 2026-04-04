import { useState, useEffect } from "react";

const EXCHANGES = [
  { city: "New York", exchange: "NYSE · NASDAQ", timezone: "America/New_York", openHour: 9, openMinute: 30, closeHour: 16, closeMinute: 0, preMarketStart: 4, afterHoursEnd: 20 },
  { city: "London", exchange: "LSE", timezone: "Europe/London", openHour: 8, openMinute: 0, closeHour: 16, closeMinute: 30, preMarketStart: 7, afterHoursEnd: 17 },
  { city: "Frankfurt", exchange: "XETRA", timezone: "Europe/Berlin", openHour: 9, openMinute: 0, closeHour: 17, closeMinute: 30, preMarketStart: 8, afterHoursEnd: 20 },
  { city: "Shanghai", exchange: "SSE", timezone: "Asia/Shanghai", openHour: 9, openMinute: 30, closeHour: 15, closeMinute: 0, preMarketStart: 9, afterHoursEnd: 15 },
  { city: "Hong Kong", exchange: "HKEX", timezone: "Asia/Hong_Kong", openHour: 9, openMinute: 30, closeHour: 16, closeMinute: 0, preMarketStart: 9, afterHoursEnd: 16 },
  { city: "Tokyo", exchange: "TSE", timezone: "Asia/Tokyo", openHour: 9, openMinute: 0, closeHour: 15, closeMinute: 30, preMarketStart: 8, afterHoursEnd: 16 },
  { city: "Sydney", exchange: "ASX", timezone: "Australia/Sydney", openHour: 10, openMinute: 0, closeHour: 16, closeMinute: 0, preMarketStart: 7, afterHoursEnd: 17 },
];

type MarketStatus = "open" | "closed" | "pre-market" | "after-hours";

function getMarketStatus(exchange: typeof EXCHANGES[0], now: Date): MarketStatus {
  const localDay = new Intl.DateTimeFormat("en-US", { timeZone: exchange.timezone, weekday: "short" }).format(now);
  if (localDay === "Sat" || localDay === "Sun") return "closed";

  const localTime = new Intl.DateTimeFormat("en-US", { timeZone: exchange.timezone, hour: "numeric", minute: "numeric", hour12: false }).format(now);
  const [hours, minutes] = localTime.split(":").map(Number);
  const total = hours * 60 + minutes;
  const openTotal = exchange.openHour * 60 + exchange.openMinute;
  const closeTotal = exchange.closeHour * 60 + exchange.closeMinute;
  const preTotal = exchange.preMarketStart * 60;
  const afterTotal = exchange.afterHoursEnd * 60;

  if (total >= openTotal && total < closeTotal) return "open";
  if (total >= preTotal && total < openTotal) return "pre-market";
  if (total >= closeTotal && total < afterTotal) return "after-hours";
  return "closed";
}

function getTimeInTz(tz: string, now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "numeric", second: "numeric", hour12: false }).formatToParts(now);
  const h = Number(parts.find(p => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find(p => p.type === "minute")?.value ?? 0);
  const s = Number(parts.find(p => p.type === "second")?.value ?? 0);
  return { h, m, s };
}

const STATUS_STYLES: Record<MarketStatus, { bg: string; color: string; label: string }> = {
  open: { bg: "rgba(22,163,74,0.12)", color: "#16a34a", label: "Open" },
  closed: { bg: "rgba(100,116,139,0.12)", color: "#64748b", label: "Closed" },
  "pre-market": { bg: "rgba(234,179,8,0.12)", color: "#ca8a04", label: "Pre-Market" },
  "after-hours": { bg: "rgba(249,115,22,0.12)", color: "#ea580c", label: "After-Hours" },
};

function AnalogClock({ h, m, s }: { h: number; m: number; s: number }) {
  const cx = 22, cy = 22, r = 19;
  const secondAngle = s * 6;
  const minuteAngle = m * 6 + s * 0.1;
  const hourAngle = (h % 12) * 30 + m * 0.5;

  const hand = (angle: number, len: number, stroke: string, width: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    const x2 = cx + len * Math.cos(rad);
    const y2 = cy + len * Math.sin(rad);
    return <line x1={cx} y1={cy} x2={x2} y2={y2} stroke={stroke} strokeWidth={width} strokeLinecap="round" />;
  };

  const tick = (angle: number) => {
    const rad = ((angle - 90) * Math.PI) / 180;
    const x1 = cx + (r - 3) * Math.cos(rad);
    const y1 = cy + (r - 3) * Math.sin(rad);
    const x2 = cx + r * Math.cos(rad);
    const y2 = cy + r * Math.sin(rad);
    return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="hsl(var(--text-muted))" strokeWidth={1.5} />;
  };

  return (
    <svg width="44" height="44" viewBox="0 0 44 44">
      <circle cx={cx} cy={cy} r={r} fill="hsl(var(--surface-card))" stroke="hsl(var(--border))" strokeWidth={1.5} />
      {[0, 90, 180, 270].map(a => <g key={a}>{tick(a)}</g>)}
      {hand(hourAngle, r * 0.28, "hsl(var(--text-primary))", 2)}
      {hand(minuteAngle, r * 0.4, "hsl(var(--text-primary))", 1.5)}
      {hand(secondAngle, r * 0.45, "#2563eb", 1)}
      <circle cx={cx} cy={cy} r={2} fill="hsl(var(--text-primary))" />
    </svg>
  );
}

function RotatingGlobe() {
  return (
    <div className="flex-shrink-0" style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", perspective: 200 }}>
      <svg
        width="36" height="36" viewBox="0 0 36 36"
        style={{ animation: "globe-spin 8s linear infinite" }}
      >
        <circle cx="18" cy="18" r="17" fill="#2563eb" />
        <ellipse cx="18" cy="18" rx="8" ry="17" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={1} />
        <ellipse cx="18" cy="18" rx="14" ry="17" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={1} />
        <ellipse cx="18" cy="18" rx="3" ry="17" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={1} />
        <ellipse cx="18" cy="11" rx="16" ry="4" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={1} />
        <ellipse cx="18" cy="25" rx="16" ry="4" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth={1} />
      </svg>
    </div>
  );
}

export function GlobalMarketClocks() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const localTime = now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  const localDate = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <>
      <style>{`@keyframes globe-spin { 0% { transform: rotateY(0deg) } 100% { transform: rotateY(360deg) } }`}</style>
      <div className="px-4 mt-2 mb-4">
        <div
          className="flex gap-3 overflow-x-auto"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <style>{`.global-clocks-row::-webkit-scrollbar { display: none; }`}</style>
          {/* Globe Card */}
          <div
            className="fintech-card flex-shrink-0 flex items-center gap-2.5"
            style={{ minWidth: 140, height: 120, padding: "12px 16px" }}
          >
            <RotatingGlobe />
            <div className="flex flex-col min-w-0">
              <span style={{ fontSize: "1rem", fontWeight: 700, color: "hsl(var(--text-primary))" }}>{localTime}</span>
              <span style={{ fontSize: "0.75rem", color: "hsl(var(--text-secondary))" }} className="truncate">{localDate}</span>
              <span style={{ fontSize: "0.65rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>Local Time</span>
            </div>
          </div>

          {/* 7 Exchange Clocks */}
          {EXCHANGES.map((ex) => {
            const t = getTimeInTz(ex.timezone, now);
            const status = getMarketStatus(ex, now);
            const style = STATUS_STYLES[status];
            const digital = new Intl.DateTimeFormat("en-US", { timeZone: ex.timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(now);

            return (
              <div
                key={ex.city}
                className="fintech-card flex-shrink-0 flex flex-col items-center justify-center"
                style={{ flex: "1 1 0%", minWidth: 80, height: 120, padding: "10px 8px", gap: 4 }}
              >
                <AnalogClock h={t.h} m={t.m} s={t.s} />
                <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "hsl(var(--text-primary))", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 4 }}>{ex.city}</span>
                <span style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))", textAlign: "center" }}>{ex.exchange}</span>
                <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "hsl(var(--text-secondary))", fontVariantNumeric: "tabular-nums" }}>{digital}</span>
                <span style={{ fontSize: "0.55rem", fontWeight: 600, padding: "1px 6px", borderRadius: 9999, textTransform: "uppercase", letterSpacing: "0.03em", background: style.bg, color: style.color }}>{style.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
