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

const STATUS_STYLES: Record<MarketStatus, { bg: string; color: string; border: string; shadow: string; label: string }> = {
  open: {
    bg: "rgba(22,163,74,0.12)",
    color: "#16a34a",
    border: "1px solid rgba(22,163,74,0.25)",
    shadow: "0 0 6px rgba(22,163,74,0.2), 0 0 12px rgba(22,163,74,0.08)",
    label: "Open",
  },
  closed: {
    bg: "rgba(239,68,68,0.1)",
    color: "#dc2626",
    border: "1px solid rgba(239,68,68,0.2)",
    shadow: "0 0 6px rgba(239,68,68,0.15), 0 0 10px rgba(239,68,68,0.06)",
    label: "Closed",
  },
  "pre-market": {
    bg: "rgba(234,179,8,0.1)",
    color: "#ca8a04",
    border: "1px solid rgba(234,179,8,0.2)",
    shadow: "0 0 6px rgba(234,179,8,0.15), 0 0 10px rgba(234,179,8,0.06)",
    label: "Pre-Market",
  },
  "after-hours": {
    bg: "rgba(249,115,22,0.1)",
    color: "#ea580c",
    border: "1px solid rgba(249,115,22,0.2)",
    shadow: "0 0 6px rgba(249,115,22,0.15), 0 0 10px rgba(249,115,22,0.06)",
    label: "After-Hours",
  },
};

function AnalogClock({ h, m, s }: { h: number; m: number; s: number }) {
  const cx = 28, cy = 28, r = 26;
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
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx={cx} cy={cy} r={r} fill="hsl(var(--surface-card))" stroke="hsl(var(--border))" strokeWidth={1.5} />
      {[0, 90, 180, 270].map(a => <g key={a}>{tick(a)}</g>)}
      {hand(hourAngle, r * 0.32, "hsl(var(--text-primary))", 2.5)}
      {hand(minuteAngle, r * 0.44, "hsl(var(--text-primary))", 1.8)}
      {hand(secondAngle, r * 0.48, "#2563eb", 1.2)}
      <circle cx={cx} cy={cy} r={2.5} fill="hsl(var(--text-primary))" />
    </svg>
  );
}

function BrandedGlobe() {
  return (
    <div
      className="flex-shrink-0"
      style={{
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: "#2563eb",
        position: "relative",
        overflow: "hidden",
        animation: "globeSpin 8s linear infinite",
      }}
    >
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        style={{ position: "absolute", top: 0, left: 0, opacity: 0.45 }}
      >
        <line x1="0" y1="13" x2="40" y2="13" stroke="white" strokeWidth={0.8} />
        <line x1="0" y1="27" x2="40" y2="27" stroke="white" strokeWidth={0.8} />
        <ellipse cx="20" cy="20" rx="8" ry="19" fill="none" stroke="white" strokeWidth={0.8} />
      </svg>
      <span
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          color: "#fff",
          fontWeight: 900,
          fontSize: "0.8rem",
          letterSpacing: "0.04em",
          zIndex: 2,
          userSelect: "none",
        }}
      >
        HF
      </span>
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

  const cardH = 116;

  return (
    <>
      <style>{`
        @keyframes globeSpin {
          0%   { box-shadow: inset -10px 0 16px rgba(0,0,0,0.35), inset 4px 0 8px rgba(255,255,255,0.08); }
          25%  { box-shadow: inset -2px 0 8px rgba(0,0,0,0.1), inset 2px 0 8px rgba(255,255,255,0.12); }
          50%  { box-shadow: inset 10px 0 16px rgba(0,0,0,0.35), inset -4px 0 8px rgba(255,255,255,0.08); }
          75%  { box-shadow: inset 2px 0 8px rgba(0,0,0,0.1), inset -2px 0 8px rgba(255,255,255,0.12); }
          100% { box-shadow: inset -10px 0 16px rgba(0,0,0,0.35), inset 4px 0 8px rgba(255,255,255,0.08); }
        }
        .global-clocks-row::-webkit-scrollbar { display: none; }
      `}</style>
      <div className="px-4 mt-2 mb-4">
        <div
          className="flex global-clocks-row"
          style={{ gap: 10, overflowX: "auto", scrollbarWidth: "none", msOverflowStyle: "none" as any }}
        >
          {/* Globe Card */}
          <div
            className="fintech-card flex-shrink-0 flex items-center gap-2.5"
            style={{ minWidth: 140, height: cardH, minHeight: cardH, padding: "12px 16px" }}
          >
            <BrandedGlobe />
            <div className="flex flex-col min-w-0">
              <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "hsl(var(--text-primary))" }}>{localTime}</span>
              <span style={{ fontSize: "0.7rem", color: "hsl(var(--text-secondary))" }} className="truncate">{localDate}</span>
              <span style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))", textTransform: "uppercase", letterSpacing: "0.05em", marginTop: 2 }}>Local Time</span>
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
                style={{ flex: "1 1 0%", minWidth: 80, height: cardH, minHeight: cardH, padding: "10px 8px", gap: 4 }}
              >
                <AnalogClock h={t.h} m={t.m} s={t.s} />
                <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "hsl(var(--text-primary))", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 4 }}>{ex.city}</span>
                <span style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))", textAlign: "center" }}>{ex.exchange}</span>
                <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "hsl(var(--text-secondary))", fontVariantNumeric: "tabular-nums" }}>{digital}</span>
                <span style={{
                  fontSize: "0.55rem",
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 9999,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  display: "inline-block",
                  marginTop: 3,
                  background: style.bg,
                  color: style.color,
                  border: style.border,
                  boxShadow: style.shadow,
                }}>{style.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
