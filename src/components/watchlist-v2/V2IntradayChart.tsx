import { useMemo } from "react";
import type { IntradayBar } from "@/lib/watchlist-v2/parsers";

interface Props {
  bars: IntradayBar[];
  className?: string;
  height?: number;
  /** Optional overlays — only rendered when sourced (never fabricated). */
  vwap?: number | null;
  priorClose?: number | null;
}

/**
 * Minimal SVG sparkline from persisted close values only.
 * Optional volume underlay when per-bar volume exists.
 * No synthetic data, no new chart dependency.
 */
export function V2IntradayChart({
  bars,
  className = "",
  height = 48,
  vwap = null,
  priorClose = null,
}: Props) {
  const chart = useMemo(() => {
    if (bars.length < 2) return null;
    const closes = bars.map((b) => b.c);
    const volumes = bars.map((b) => b.v);
    const hasVolume = volumes.some((v) => v > 0);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const w = 200;
    const h = height;
    const priceH = hasVolume ? h * 0.72 : h;
    const step = w / (closes.length - 1);
    const points = closes.map((c, i) => {
      const x = i * step;
      const y = priceH - ((c - min) / range) * (priceH - 2) - 1;
      return { x, y };
    });
    const lineD = `M${points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" L")}`;
    const areaD =
      `${lineD} L${points[points.length - 1].x.toFixed(2)},${priceH.toFixed(2)}` +
      ` L${points[0].x.toFixed(2)},${priceH.toFixed(2)} Z`;
    const first = closes[0];
    const last = closes[closes.length - 1];
    const up = last >= first;
    const stroke = up ? "hsl(152 55% 36%)" : "hsl(0 65% 48%)";
    const fill = up ? "hsl(152 55% 36% / 0.14)" : "hsl(0 65% 48% / 0.12)";

    const maxVol = hasVolume ? Math.max(...volumes, 1) : 1;
    const volBars = hasVolume
      ? volumes.map((v, i) => {
          const vh = (v / maxVol) * (h - priceH - 2);
          return {
            x: i * step - step * 0.35,
            y: h - vh,
            width: Math.max(step * 0.7, 1),
            height: vh,
          };
        })
      : [];

    const yFor = (price: number) =>
      priceH - ((price - min) / range) * (priceH - 2) - 1;

    const overlays: { y: number; dash: string; color: string }[] = [];
    if (vwap !== null && vwap >= min && vwap <= max) {
      overlays.push({ y: yFor(vwap), dash: "3 2", color: "hsl(187 70% 40% / 0.75)" });
    }
    if (priorClose !== null && priorClose >= min && priorClose <= max) {
      overlays.push({ y: yFor(priorClose), dash: "2 3", color: "hsl(220 10% 50% / 0.55)" });
    }

    return { lineD, areaD, stroke, fill, w, h, volBars, overlays };
  }, [bars, height, vwap, priorClose]);

  if (!chart) {
    return (
      <div
        className={`flex items-center justify-center text-[10px] text-muted-foreground ${className}`}
        style={{ height }}
      >
        Chart unavailable
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${chart.w} ${chart.h}`}
      preserveAspectRatio="none"
      className={`w-full ${className}`}
      style={{ height }}
      aria-label="Intraday price"
      role="img"
    >
      {chart.volBars.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={b.y}
          width={b.width}
          height={b.height}
          fill="hsl(215 16% 50% / 0.18)"
        />
      ))}
      <path d={chart.areaD} fill={chart.fill} />
      <path d={chart.lineD} fill="none" stroke={chart.stroke} strokeWidth={1.5} />
      {chart.overlays.map((o, i) => (
        <line
          key={i}
          x1={0}
          x2={chart.w}
          y1={o.y}
          y2={o.y}
          stroke={o.color}
          strokeWidth={1}
          strokeDasharray={o.dash}
        />
      ))}
    </svg>
  );
}
