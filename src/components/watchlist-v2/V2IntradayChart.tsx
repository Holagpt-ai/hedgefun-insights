import { useMemo } from "react";
import type { IntradayBar } from "@/lib/watchlist-v2/parsers";

interface Props {
  bars: IntradayBar[];
  className?: string;
  height?: number;
}

// Minimal SVG sparkline from persisted close values only.
// No synthetic data, no directional placeholder.
export function V2IntradayChart({ bars, className = "", height = 48 }: Props) {
  const path = useMemo(() => {
    if (bars.length < 2) return null;
    const closes = bars.map((b) => b.c);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const w = 200;
    const h = height;
    const step = w / (closes.length - 1);
    const points = closes.map((c, i) => {
      const x = i * step;
      const y = h - ((c - min) / range) * h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const first = closes[0];
    const last = closes[closes.length - 1];
    const stroke = last >= first ? "hsl(142 71% 40%)" : "hsl(0 72% 50%)";
    return { d: `M${points.join(" L")}`, stroke, w, h };
  }, [bars, height]);

  if (!path) {
    return (
      <div
        className={`flex items-center justify-center text-xs text-muted-foreground ${className}`}
        style={{ height }}
      >
        Intraday chart unavailable
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${path.w} ${path.h}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
      aria-label="Intraday price"
      role="img"
    >
      <path d={path.d} fill="none" stroke={path.stroke} strokeWidth={1.5} />
    </svg>
  );
}
