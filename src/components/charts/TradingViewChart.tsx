import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  LineSeries,
  AreaSeries,
  HistogramSeries,
} from 'lightweight-charts';
import type { IChartApi } from 'lightweight-charts';
import { Skeleton } from '@/components/ui/skeleton';

type ChartType = 'area' | 'line' | 'candlestick' | 'heikinashi';
type Indicator = 'volume' | 'sma20' | 'sma50' | 'sma200';

export interface OHLCVData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TradingViewChartProps {
  data: OHLCVData[];
  ticker: string;
  companyName?: string;
  isPositive?: boolean;
  height?: number;
  loading?: boolean;
  chartType?: ChartType;
  onChartTypeChange?: (type: ChartType) => void;
  hideToolbar?: boolean;
}

function calcSMA(data: OHLCVData[], period: number) {
  return data
    .map((d, i) => {
      if (i < period - 1) return null;
      const slice = data.slice(i - period + 1, i + 1);
      const avg = slice.reduce((s, x) => s + x.close, 0) / period;
      return { time: d.time, value: avg };
    })
    .filter(Boolean) as { time: string; value: number }[];
}

function calcHeikinAshi(data: OHLCVData[]) {
  const result: { time: string; open: number; high: number; low: number; close: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const haClose = (d.open + d.high + d.low + d.close) / 4;
    const haOpen = i === 0
      ? (d.open + d.close) / 2
      : (result[i - 1].open + result[i - 1].close) / 2;
    const haHigh = Math.max(d.high, haOpen, haClose);
    const haLow = Math.min(d.low, haOpen, haClose);
    result.push({ time: d.time, open: haOpen, high: haHigh, low: haLow, close: haClose });
  }
  return result;
}

export default function TradingViewChart({
  data,
  ticker,
  companyName,
  isPositive = true,
  height = 400,
  loading = false,
  chartType: controlledChartType,
  onChartTypeChange,
  hideToolbar = false,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  const [internalChartType, setInternalChartType] = useState<ChartType>(controlledChartType ?? 'area');
  const chartType = controlledChartType ?? internalChartType;
  const setChartType = (type: ChartType) => {
    setInternalChartType(type);
    onChartTypeChange?.(type);
  };
  const [activeIndicators, setActiveIndicators] = useState<Set<Indicator>>(new Set(['volume']));
  const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));

  const seoTitle = companyName
    ? `${companyName} (${ticker}) Real-Time Analysis & Probability Forecast Chart | Hedgefun`
    : `${ticker} Technical Analysis Chart | Hedgefun`;

  // Intersection observer for lazy loading
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); io.disconnect(); } },
      { rootMargin: '200px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || !data.length) return;

    // Remove previous chart instance if it exists
    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const bg = isDark ? '#1e293b' : '#ffffff';
    const textColor = isDark ? '#94a3b8' : '#64748b';
    const gridColor = isDark ? '#334155' : '#f1f5f9';
    const borderColor = isDark ? '#334155' : '#e2e8f0';
    const upColor = '#16a34a';
    const downColor = '#dc2626';
    const accentColor = isPositive ? upColor : downColor;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor,
        fontFamily: 'DM Sans, sans-serif',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor,
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      timeScale: {
        borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
    });

    chartRef.current = chart;

    // Add main series based on chart type
    if (chartType === 'candlestick' || chartType === 'heikinashi') {
      const series = chart.addSeries(CandlestickSeries, {
        upColor,
        downColor,
        borderUpColor: upColor,
        borderDownColor: downColor,
        wickUpColor: upColor,
        wickDownColor: downColor,
      });
      const seriesData = chartType === 'heikinashi'
        ? calcHeikinAshi(data)
        : data.map(d => ({ time: d.time, open: d.open, high: d.high, low: d.low, close: d.close }));
      series.setData(seriesData as any);
    } else if (chartType === 'line') {
      const series = chart.addSeries(LineSeries, { color: accentColor, lineWidth: 2 });
      series.setData(data.map(d => ({ time: d.time, value: d.close })) as any);
    } else {
      // area (default)
      const series = chart.addSeries(AreaSeries, {
        lineColor: accentColor,
        topColor: accentColor + '40',
        bottomColor: accentColor + '00',
        lineWidth: 2,
      });
      series.setData(data.map(d => ({ time: d.time, value: d.close })) as any);
    }

    // Volume overlay
    if (activeIndicators.has('volume')) {
      const volSeries = chart.addSeries(HistogramSeries, {
        color: '#94a3b826',
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
      volSeries.setData(data.map(d => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? upColor + '60' : downColor + '60',
      })) as any);
    }

    // SMA overlays
    if (activeIndicators.has('sma20')) {
      const s = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 1, title: 'SMA 20' });
      s.setData(calcSMA(data, 20) as any);
    }
    if (activeIndicators.has('sma50')) {
      const s = chart.addSeries(LineSeries, { color: '#8b5cf6', lineWidth: 1, title: 'SMA 50' });
      s.setData(calcSMA(data, 50) as any);
    }
    if (activeIndicators.has('sma200')) {
      const s = chart.addSeries(LineSeries, { color: '#ec4899', lineWidth: 1, title: 'SMA 200' });
      s.setData(calcSMA(data, 200) as any);
    }

    chart.timeScale().fitContent();

    let watermarkApplied = false;
    const resizeObserver = new ResizeObserver(() => {
      if (chartContainerRef.current) {
        const newWidth = chartContainerRef.current.clientWidth;
        chart.applyOptions({ width: newWidth });
        if (!watermarkApplied && newWidth > 100) {
          watermarkApplied = true;
          (chart as any).applyOptions({
            watermark: {
              visible: true,
              fontSize: 36,
              horzAlign: "center",
              vertAlign: "center",
              color: "rgba(150, 150, 150, 0.18)",
              text: ticker,
            },
          });
        }
      }
    });
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, chartType, activeIndicators, isDark, isPositive, height, ticker]);


  const toggleIndicator = (ind: Indicator) => {
    setActiveIndicators(prev => {
      const next = new Set(prev);
      if (next.has(ind)) next.delete(ind);
      else next.add(ind);
      return next;
    });
  };

  if (loading) {
    return <Skeleton className="w-full rounded-[var(--radius)]" style={{ height }} aria-label={seoTitle} />;
  }

  if (!data.length) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground border border-border rounded-[var(--radius)]"
        style={{ height }}
        aria-label={seoTitle}
        role="img"
        title={seoTitle}
      >
        No chart data available
      </div>
    );
  }

  const CHART_TYPES: { type: ChartType; label: string }[] = [
    { type: 'area', label: 'Area' },
    { type: 'line', label: 'Line' },
    { type: 'candlestick', label: 'Candles' },
    { type: 'heikinashi', label: 'Heikin-Ashi' },
  ];

  const INDICATORS: { ind: Indicator; label: string; color: string }[] = [
    { ind: 'volume', label: 'Vol', color: '#94a3b8' },
    { ind: 'sma20', label: 'SMA 20', color: '#f59e0b' },
    { ind: 'sma50', label: 'SMA 50', color: '#8b5cf6' },
    { ind: 'sma200', label: 'SMA 200', color: '#ec4899' },
  ];

  return (
    <div
      ref={sentinelRef}
      className={hideToolbar ? "" : "border border-border rounded-[var(--radius)] overflow-hidden"}
      aria-label={seoTitle}
      title={seoTitle}
      role="img"
    >
      {!inView ? (
        <div className="animate-pulse bg-muted rounded-[var(--radius)]" style={{ height }} />
      ) : (
        <>
          {!hideToolbar && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-border bg-muted/30">
              <span className="text-[0.6875rem] font-semibold text-muted-foreground mr-1">Type:</span>
              {CHART_TYPES.map(({ type, label }) => (
                <button
                  key={type}
                  onClick={() => setChartType(type)}
                  className={`px-2.5 py-1 text-[0.75rem] rounded border transition-colors ${
                    chartType === type
                      ? 'bg-accent-blue text-primary-foreground border-accent-blue'
                      : 'border-border text-muted-foreground hover:border-accent-blue hover:text-accent-blue'
                  }`}
                >
                  {label}
                </button>
              ))}
              <span className="text-[0.6875rem] font-semibold text-muted-foreground ml-2 mr-1">Indicators:</span>
              {INDICATORS.map(({ ind, label, color }) => (
                <button
                  key={ind}
                  onClick={() => toggleIndicator(ind)}
                  className={`px-2.5 py-1 text-[0.75rem] rounded border transition-colors ${
                    activeIndicators.has(ind)
                      ? 'text-white border-transparent'
                      : 'border-border text-muted-foreground hover:border-accent-blue'
                  }`}
                  style={activeIndicators.has(ind) ? { backgroundColor: color } : {}}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <div ref={chartContainerRef} style={{ height }} />
        </>
      )}
    </div>
  );
}
