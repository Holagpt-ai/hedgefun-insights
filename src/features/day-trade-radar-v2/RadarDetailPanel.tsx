import { Link } from "react-router-dom";
import { Plus, Check, Loader2, Newspaper, Sparkles, BookOpen, ExternalLink, LayoutDashboard } from "lucide-react";
import TradingViewChart, { type OHLCVData } from "@/components/charts/TradingViewChart";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { useCatalystEnrichmentForSymbols } from "@/hooks/useCatalystEnrichmentForSymbols";
import { catalystSymbolHref } from "@/lib/catalyst/enrichment";
import { EVENT_TYPE_LABEL, normalizeSymbol } from "@/lib/catalyst/parsers";
import { parseTimestampMs } from "@/lib/screeners/contract";
import {
  formatHodDistance,
  formatRadarDayRange,
  formatRadarMultiplier,
  formatRadarPercent,
  formatRadarPrice,
  formatRadarVolume,
  moveClass,
  volumeRatioClass,
} from "./radar-metrics";
import type { RadarChartBar, RadarChartStatus, RadarRankedRow } from "./types";

interface RadarDetailPanelProps {
  row: RadarRankedRow | null;
  inactive: boolean;
  chartStatus: RadarChartStatus;
  chartBars: RadarChartBar[];
  latestBarIso: string | null;
  chartError: string | null;
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
                    : row.signal === "TOP LEADER"
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
          <Metric label="Prior Vol" value={formatRadarVolume(row.prior_session_volume)} />
          <Metric
            label="Vol / Prior"
            value={formatRadarMultiplier(row.volume_ratio_prior_session)}
            className={volumeRatioClass(row.volume_ratio_prior_session)}
          />
          <Metric label="HOD Dist" value={formatHodDistance(row.hod_distance_percent)} />
          <Metric
            label="Day Range"
            value={formatRadarDayRange(row.day_low, row.day_high)}
          />
          <Metric label="Provider" value={providerLabel ?? "—"} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Intraday (1m delayed)
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
              {chartError ?? "Chart data unavailable"}
            </div>
          )}
          {chartStatus === "empty" && (
            <div className="flex h-[220px] items-center justify-center rounded-md border border-border text-sm text-muted-foreground">
              No intraday bars returned for this session.
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
            PR / Catalyst
          </div>
          {catalystCheckPending ? (
            <div className="text-[12px] text-muted-foreground">Catalyst check pending</div>
          ) : catalystError ? (
            <div className="text-[12px] text-muted-foreground">Catalyst unavailable</div>
          ) : !entry ? (
            <div className="text-[12px] text-muted-foreground">No confirmed catalyst</div>
          ) : (
            <Link
              to={
                catalystSymbolHref(sym) ??
                `/dashboard/catalyst?symbol=${encodeURIComponent(sym)}`
              }
              className="block text-[12px] hover:underline"
            >
              <span className="text-muted-foreground">
                {EVENT_TYPE_LABEL[entry.event.event_type] ?? "Catalyst"} ·{" "}
              </span>
              {entry.event.title ?? "View catalyst"}
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
