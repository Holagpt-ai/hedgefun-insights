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

const PILL_STYLES: Record<MarketStatus, { background: string; color: string; border: string; boxShadow: string; label: string }> = {
  open: {
    background: "rgba(22,163,74,0.1)",
    color: "#16a34a",
    border: "1px solid rgba(22,163,74,0.25)",
    boxShadow: "0 0 8px rgba(22,163,74,0.2)",
    label: "Open",
  },
  closed: {
    background: "rgba(239,68,68,0.1)",
    color: "#dc2626",
    border: "1px solid rgba(239,68,68,0.2)",
    boxShadow: "0 0 8px rgba(239,68,68,0.15)",
    label: "Closed",
  },
  "pre-market": {
    background: "rgba(234,179,8,0.1)",
    color: "#ca8a04",
    border: "1px solid rgba(234,179,8,0.2)",
    boxShadow: "0 0 8px rgba(234,179,8,0.15)",
    label: "Pre-Market",
  },
  "after-hours": {
    background: "rgba(249,115,22,0.1)",
    color: "#ea580c",
    border: "1px solid rgba(249,115,22,0.2)",
    boxShadow: "0 0 8px rgba(249,115,22,0.15)",
    label: "After-Hours",
  },
};

function ClockFace({ hours, minutes, seconds }: { hours: number; minutes: number; seconds: number }) {
  const cx = 28;
  const cy = 28;
  const r = 24;

  const secDeg = seconds * 6;
  const minDeg = minutes * 6 + seconds * 0.1;
  const hrDeg = (hours % 12) * 30 + minutes * 0.5;

  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;

  const hrX = cx + 14 * Math.cos(toRad(hrDeg));
  const hrY = cy + 14 * Math.sin(toRad(hrDeg));
  const minX = cx + 19 * Math.cos(toRad(minDeg));
  const minY = cy + 19 * Math.sin(toRad(minDeg));
  const secX = cx + 21 * Math.cos(toRad(secDeg));
  const secY = cy + 21 * Math.sin(toRad(secDeg));

  const ticks = [0, 90, 180, 270].map((deg) => {
    const inner = 20;
    const outer = 23;
    const rad = toRad(deg);
    return {
      x1: cx + inner * Math.cos(rad),
      y1: cy + inner * Math.sin(rad),
      x2: cx + outer * Math.cos(rad),
      y2: cy + outer * Math.sin(rad),
    };
  });

  return (
    <svg width="56" height="56" viewBox="0 0 56 56">
      <circle cx={cx} cy={cy} r={r} fill="hsl(var(--surface-card))" stroke="hsl(var(--border))" strokeWidth={1.5} />
      {ticks.map((t, i) => (
        <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="hsl(var(--text-muted))" strokeWidth={1.5} />
      ))}
      <line x1={cx} y1={cy} x2={hrX} y2={hrY} stroke="hsl(var(--text-primary))" strokeWidth={2.5} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={minX} y2={minY} stroke="hsl(var(--text-primary))" strokeWidth={1.8} strokeLinecap="round" />
      <line x1={cx} y1={cy} x2={secX} y2={secY} stroke="#2563eb" strokeWidth={1.2} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={2.5} fill="hsl(var(--text-primary))" />
    </svg>
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
        @keyframes hfGlobeSpin {
          0%   { box-shadow: inset -12px 0 20px rgba(0,0,0,0.4), inset 5px 0 10px rgba(255,255,255,0.1); }
          25%  { box-shadow: inset -3px 0 10px rgba(0,0,0,0.15), inset 3px 0 10px rgba(255,255,255,0.15); }
          50%  { box-shadow: inset 12px 0 20px rgba(0,0,0,0.4), inset -5px 0 10px rgba(255,255,255,0.1); }
          75%  { box-shadow: inset 3px 0 10px rgba(0,0,0,0.15), inset -3px 0 10px rgba(255,255,255,0.15); }
          100% { box-shadow: inset -12px 0 20px rgba(0,0,0,0.4), inset 5px 0 10px rgba(255,255,255,0.1); }
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
            <div
              className="flex-shrink-0"
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "#2563eb",
                position: "relative",
                overflow: "hidden",
                animation: "hfGlobeSpin 8s linear infinite",
              }}
            >
              <svg
                width="52"
                height="52"
                viewBox="0 0 52 52"
                style={{ position: "absolute", top: 0, left: 0, opacity: 0.45 }}
              >
                <line x1="0" y1="17" x2="52" y2="17" stroke="white" strokeWidth={0.8} />
                <line x1="0" y1="35" x2="52" y2="35" stroke="white" strokeWidth={0.8} />
                <ellipse cx="26" cy="26" rx="10" ry="25" fill="none" stroke="white" strokeWidth={0.8} />
              </svg>
              <span
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: "1rem",
                  letterSpacing: "0.04em",
                  zIndex: 2,
                  userSelect: "none",
                }}
              >
                HF
              </span>
            </div>
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
            const pill = PILL_STYLES[status];
            const digital = new Intl.DateTimeFormat("en-US", { timeZone: ex.timezone, hour: "numeric", minute: "2-digit", hour12: true }).format(now);

            return (
              <div
                key={ex.city}
                className="fintech-card flex-shrink-0 flex flex-col items-center justify-center"
                style={{ flex: "1 1 0%", minWidth: 80, height: cardH, minHeight: cardH, padding: "10px 8px", gap: 4 }}
              >
                <ClockFace hours={t.h} minutes={t.m} seconds={t.s} />
                <span style={{ fontSize: "0.7rem", fontWeight: 700, color: "hsl(var(--text-primary))", textTransform: "uppercase", letterSpacing: "0.04em", marginTop: 4 }}>{ex.city}</span>
                <span style={{ fontSize: "0.6rem", color: "hsl(var(--text-muted))", textAlign: "center" }}>{ex.exchange}</span>
                <span style={{ fontSize: "0.65rem", fontWeight: 600, color: "hsl(var(--text-secondary))", fontVariantNumeric: "tabular-nums" }}>{digital}</span>
                <span style={{
                  fontSize: "0.55rem",
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 9999,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  display: "inline-block",
                  marginTop: 3,
                  background: pill.background,
                  color: pill.color,
                  border: pill.border,
                  boxShadow: pill.boxShadow,
                }}>{pill.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
