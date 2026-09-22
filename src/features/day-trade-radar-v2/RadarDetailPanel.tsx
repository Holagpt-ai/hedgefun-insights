import { Link } from "react-router-dom";
import { Plus, Check, Loader2, Newspaper, Sparkles, BookOpen, ExternalLink, LayoutDashboard } from "lucide-react";
import TradingViewChart, { type OHLCVData } from "@/components/charts/TradingViewChart";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { useCatalystEnrichmentForSymbols } from "@/hooks/useCatalystEnrichmentForSymbols";
import { useRecentProviderNewsForSymbols } from "@/hooks/useRecentProviderNewsForSymbols";
import { catalystSymbolHref } from "@/lib/catalyst/enrichment";
import { normalizeSymbol } from "@/lib/catalyst/parsers";
import { parseTimestampMs } from "@/lib/screeners/contract";
import {
  formatFreshness,
  formatHodDistance,
  formatRadarAcceleration,
  formatRadarDayRange,
  formatRadarDollarVolume,
  formatRadarMultiplier,
  formatRadarPercent,
  formatRadarPrice,
  formatRadarUnavailableMetric,
  formatRadarVolume,
  formatShortWindowMove,
  formatVwapState,
  moveClass,
  volumeRatioClass,
} from "./radar-metrics";
import type { RadarChartBar, RadarChartStatus, RadarRankedRow } from "./types";
import type { RadarChartInterval } from "./radar-chart-data";
import { radarChartEmptyCopy, radarChartIntervalLabel } from "./radar-chart-data";
import { NO_VERIFIED_NEWS_COPY, resolveRadarNewsCellState } from "./radar-news-display";
import { HistoricalBehaviorSection } from "./HistoricalBehavior";

interface RadarDetailPanelProps {
  row: RadarRankedRow | null;
  inactive: boolean;
  chartStatus: RadarChartStatus;
  chartBars: RadarChartBar[];
  latestBarIso: string | null;
  chartError: string | null;
  chartInterval?: RadarChartInterval | null;
  onCloseMobile?: () => void;
  mobile?: boolean;
}

function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-[13px] font-medium tabular-nums truncate ${className ?? ""}`}>
        {value}
      </div>
    </div>
  );
}

export function RadarDetailPanel({
  row,
  inactive,
  chartStatus,
  chartBars,
  latestBarIso,
  chartError,
  chartInterval = null,
  onCloseMobile,
  mobile = false,
}: RadarDetailPanelProps) {
  const { add: addToWatchlist, isAdded, pendingSymbol } = useAddToWatchlist();
  const symbols = row ? [normalizeSymbol(row.symbol)].filter(Boolean) as string[] : [];
  const {
    data: catalystMap,
    isPending: catalystPending,
    isFetching: catalystFetching,
    isError: catalystError,
  } = useCatalystEnrichmentForSymbols(symbols);
  const newsState = useRecentProviderNewsForSymbols(symbols);
  const catalystCheckPending =
    symbols.length > 0 && (catalystPending || (catalystFetching && !catalystMap));

  if (!row) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Select a qualifying ticker to load its Radar detail and intraday chart.
      </div>
    );
  }

  const sym = row.symbol;
  const company = row.company_name?.trim() || sym;
  const already = isAdded(sym);
  const pending = pendingSymbol === sym;
  const entry = catalystMap?.get(sym);
  const news = resolveRadarNewsCellState({
    symbol: sym,
    catalyst: entry,
    recent: newsState.getHeadline(sym),
    newsStatus: newsState.getStatus(sym),
    catalystPending: catalystCheckPending && !entry,
    catalystUnavailable: !!catalystError && !entry,
  });
  const ohlcv: OHLCVData[] = chartBars.map((b) => ({
    time: b.time,
    open: b.open,
    high: b.high,
    low: b.low,
    close: b.close,
    volume: b.volume,
  }));
  const latestBarLabel = latestBarIso
    ? (() => {
        const ms = parseTimestampMs(latestBarIso);
        return ms === null ? null : new Date(ms).toLocaleString();
      })()
    : null;
  const providerLabel = (() => {
    const ms = parseTimestampMs(row.provider_as_of);
    return ms === null ? null : new Date(ms).toLocaleString();
  })();

  return (
    <div
      className={`rounded-lg border border-border bg-card ${
        mobile ? "fixed inset-0 z-40 overflow-y-auto rounded-none" : ""
      }`}
    >
      <div className="p-4 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                #{row.rank}
              </span>
              <Link
                to={`/stocks/${sym}`}
                className="text-lg font-bold text-accent-blue hover:underline"
              >
                {sym}
              </Link>
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide ${
                  inactive || row.signal === "INACTIVE"
                    ? "text-muted-foreground"
                    : row.signal === "TOP LEADER" || row.signal === "EXPLOSIVE" || row.signal === "REACTIVATED"
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-foreground"
                }`}
              >
                {inactive ? "INACTIVE" : row.signal}
              </span>
            </div>
            <div className="text-[12px] text-muted-foreground truncate">{company}</div>
          </div>
          {mobile && onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              className="h-8 rounded-md border border-border px-3 text-[12px] font-semibold"
            >
              Close
            </button>
          )}
        </div>

        {(inactive || row.signal === "INACTIVE") && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px]">
            No longer in active Radar. Chart retained from last verified snapshot.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Metric label="Last" value={formatRadarPrice(row.price)} />
          <Metric
            label="Move"
            value={formatRadarPercent(row.change_percent)}
            className={moveClass(row.change_percent)}
          />
          <Metric label="Volume" value={formatRadarVolume(row.volume)} />
          <Metric label="Prior Day Vol" value={formatRadarVolume(row.prior_session_volume)} />
          <Metric
            label="Vol / Prior Day"
            value={formatRadarMultiplier(row.volume_ratio_prior_session)}
            className={volumeRatioClass(row.volume_ratio_prior_session)}
          />
          <Metric label="HOD Dist" value={formatHodDistance(row.hod_distance_percent)} />
          <Metric
            label="Day Range"
            value={formatRadarDayRange(row.day_low, row.day_high)}
          />
          <Metric label="Data Time" value={providerLabel ?? "Unavailable"} />
          <Metric label="5s Volume" value={formatRadarUnavailableMetric(row.rolling_volume_5s)} />
          <Metric label="15s Volume" value={formatRadarUnavailableMetric(row.rolling_volume_15s)} />
          <Metric label="60s Volume" value={formatRadarUnavailableMetric(row.rolling_volume_60s)} />
          <Metric label="60s Dollar Volume" value={formatRadarDollarVolume(row.rolling_dollar_volume_60s)} />
          <Metric label="5m Acceleration" value={formatRadarAcceleration(row.acceleration_5m)} />
          <Metric label="VWAP State" value={formatVwapState(row.vwap_side, row.session_vwap)} />
          <Metric label="Freshness" value={formatFreshness(row.freshness_class)} />
          <Metric
            label="15s Move"
            value={formatShortWindowMove(row.move_15s_pct)}
            className={moveClass(row.move_15s_pct)}
          />
          <Metric
            label="60s Move"
            value={formatShortWindowMove(row.move_60s_pct)}
            className={moveClass(row.move_60s_pct)}
          />
        </div>

        <HistoricalBehaviorSection context={row.historicalContext} />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {radarChartIntervalLabel(chartInterval)}
            </div>
            <Link
              to={`/chart/${encodeURIComponent(sym)}`}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-accent-blue hover:underline"
            >
              Full chart <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
          {chartStatus === "loading" && (
            <TradingViewChart data={[]} ticker={sym} loading height={220} hideToolbar chartType="candlestick" />
          )}
          {chartStatus === "error" && (
            <div className="flex h-[220px] items-center justify-center rounded-md border border-border text-sm text-muted-foreground">
              {chartError ?? radarChartEmptyCopy("error")}
            </div>
          )}
          {chartStatus === "empty" && (
            <div className="flex h-[220px] items-center justify-center rounded-md border border-border text-sm text-muted-foreground">
              {radarChartEmptyCopy("empty")}
            </div>
          )}
          {chartStatus === "available" && (
            <TradingViewChart
              data={ohlcv}
              ticker={sym}
              companyName={company}
              isPositive={(row.change_percent ?? 0) >= 0}
              height={220}
              hideToolbar
              chartType="candlestick"
            />
          )}
          {chartStatus === "idle" && (
            <div className="flex h-[220px] items-center justify-center rounded-md border border-border text-sm text-muted-foreground">
              Chart idle
            </div>
          )}
          {latestBarLabel && chartStatus === "available" && (
            <div className="text-[11px] text-muted-foreground">
              Latest bar: {latestBarLabel}
            </div>
          )}
        </div>

        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            News / Catalyst
          </div>
          {news.level === "pending" ? (
            <div className="text-[12px] text-muted-foreground">News check pending</div>
          ) : news.level === "unavailable" ? (
            <div className="text-[12px] text-muted-foreground">News unavailable</div>
          ) : news.level === "none" ? (
            <div className="text-[12px] text-muted-foreground">{NO_VERIFIED_NEWS_COPY}</div>
          ) : news.level === "recent" ? (
            news.href ? (
              <a
                href={news.href}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-[12px] hover:underline"
              >
                <span className="text-muted-foreground">
                  Recent News · {[news.source, news.ageLabel].filter(Boolean).join(" · ")} ·{" "}
                </span>
                {news.title}
              </a>
            ) : (
              <div className="text-[12px]">
                <span className="text-muted-foreground">
                  Recent News · {[news.source, news.ageLabel].filter(Boolean).join(" · ")} ·{" "}
                </span>
                {news.title}
              </div>
            )
          ) : (
            <Link
              to={news.href}
              className="block text-[12px] hover:underline"
            >
              <span className="text-muted-foreground">
                Verified Catalyst · {news.category}
                {news.ageLabel ? ` · ${news.ageLabel}` : ""} ·{" "}
              </span>
              {news.title}
            </Link>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => {
              if (!already && !pending) addToWatchlist(sym);
            }}
            disabled={already || pending}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-medium hover:bg-muted disabled:opacity-70"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : already ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Watchlist
          </button>
          <Link
            to={
              catalystSymbolHref(sym) ??
              `/dashboard/catalyst?symbol=${encodeURIComponent(sym)}`
            }
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-medium hover:bg-muted"
          >
            <Newspaper className="h-3.5 w-3.5" /> Catalyst
          </Link>
          <Link
            to={`/dashboard/ai?symbol=${encodeURIComponent(sym)}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-medium hover:bg-muted"
          >
            <Sparkles className="h-3.5 w-3.5" /> AI Analyst
          </Link>
          <Link
            to={`/dashboard/journal?symbol=${encodeURIComponent(sym)}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-medium hover:bg-muted"
          >
            <BookOpen className="h-3.5 w-3.5" /> Journal
          </Link>
          {/* Action Center does not consume ?symbol= — route only, no false claim. */}
          <Link
            to="/dashboard/action-center"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2.5 text-[12px] font-medium hover:bg-muted"
          >
            <LayoutDashboard className="h-3.5 w-3.5" /> Action Center
          </Link>
        </div>
      </div>
    </div>
  );
}
