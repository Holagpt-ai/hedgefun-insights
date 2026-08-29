import { Link } from "react-router-dom";
import { useState } from "react";
import type { V2Row } from "@/hooks/useWatchlistV2";
import type { EarningsBadge } from "@/lib/watchlist-v2/earnings";
import { humanFailureReason, humanFailureReasonSecondary, isExpired, isExpectedUnavailableReason, formatMarketDataAge } from "@/lib/watchlist-v2/parsers";
import {
  densityTokens,
  dollarMove,
  dollarVolume,
  rangePosition,
  rvolIntensityTier,
  vwapDistance,
  type WatchlistDensity,
} from "@/lib/watchlist-v2/metrics";
import { V2IntradayChart } from "./V2IntradayChart";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BarChart3,
  BrainCircuit,
  BookOpen,
  Flame,
  LineChart,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  row: V2Row;
  onRefresh: (t: string) => void;
  onRemove: (t: string) => void;
  isRefreshing: boolean;
  density?: WatchlistDensity;
  earnings?: EarningsBadge | null;
}

const num = (n: number | null, digits = 2) =>
  n === null
    ? "—"
    : n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const compactVol = (n: number | null) => {
  if (n === null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
};

const sessionLabel = (s: V2Row["sessionType"]) =>
  s === "premarket" ? "Pre-market" : s === "postclose" ? "Post-close" : "RTH";

const directionBadge = (d: V2Row["direction"], failureReason: string | null) => {
  const map: Record<
    Exclude<V2Row["direction"], "data_unavailable">,
    { label: string; className: string; Icon: typeof TrendingUp }
  > = {
    bullish: {
      label: "Bullish",
      className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/35 dark:text-emerald-300",
      Icon: TrendingUp,
    },
    bearish: {
      label: "Bearish",
      className: "bg-red-100 text-red-800 dark:bg-red-900/35 dark:text-red-300",
      Icon: TrendingDown,
    },
    neutral: {
      label: "Neutral",
      className: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
      Icon: Minus,
    },
  };
  if (d === "data_unavailable") {
    const label =
      failureReason === "SNAPSHOT_STALE"
        ? "Waiting for fresh market data"
        : failureReason === "INSUFFICIENT_EVIDENCE"
          ? "Not enough trading evidence yet"
          : "Data Unavailable";
    return {
      label,
      className: "bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
      Icon: Minus,
    };
  }
  return map[d];
};

function formatRelative(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function RvolMeter({ rvol, tier }: { rvol: number | null; tier: ReturnType<typeof rvolIntensityTier> }) {
  const pct = rvol === null ? 0 : Math.min(100, Math.max(0, (rvol / 4) * 100));
  const bar =
    tier === "unusual"
      ? "bg-amber-500"
      : tier === "elevated"
        ? "bg-cyan-500"
        : tier === "normal"
          ? "bg-slate-400"
          : "bg-transparent";
  return (
    <div
      className="h-1 w-full max-w-[72px] rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mt-1"
      role="meter"
      aria-label={rvol === null ? "RVOL unavailable" : `RVOL ${rvol.toFixed(2)} times`}
      aria-valuenow={rvol ?? undefined}
      aria-valuemin={0}
      aria-valuemax={4}
    >
      <div
        className={cn("h-full rounded-full motion-safe:transition-[width] motion-safe:duration-150", bar)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function RangeBar({ pos }: { pos: number | null }) {
  if (pos === null) {
    return <span className="text-[10px] text-muted-foreground">Range unavailable</span>;
  }
  const clamped = Math.min(1, Math.max(0, pos));
  return (
    <div className="flex items-center gap-1.5 min-w-[72px]" aria-label={`Range position ${Math.round(clamped * 100)} percent`}>
      <span className="text-[9px] text-muted-foreground">L</span>
      <div className="relative h-1 flex-1 rounded-full bg-slate-200 dark:bg-slate-700">
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-slate-700 dark:bg-slate-200"
          style={{ left: `calc(${clamped * 100}% - 4px)` }}
        />
      </div>
      <span className="text-[9px] text-muted-foreground">H</span>
    </div>
  );
}

export function WatchlistRowV2({
  row,
  onRefresh,
  onRemove,
  isRefreshing,
  density = "compact",
  earnings = null,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const tokens = densityTokens(density);
  const dir = directionBadge(row.direction, row.failureReason);
  const DirIcon = dir.Icon;
  const expired = row.hasV2 && isExpired(row.validThrough);
  const change = row.changePct;
  const changeColor =
    change === null
      ? "text-muted-foreground"
      : change >= 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-red-600 dark:text-red-400";

  const isUnavailable = row.direction === "data_unavailable";
  const expectedUnavailable = isUnavailable && isExpectedUnavailableReason(row.failureReason);
  const providerFailed = row.requestStatus === "failed";
  const marketDataAge = formatMarketDataAge(row.inputsQuality.snapshot_ts_ms);
  const unavailableSecondary = expectedUnavailable ? humanFailureReasonSecondary(row.failureReason) : null;

  const statusLine = (() => {
    if (row.requestStatus === "pending") return { text: "Analysis pending", tone: "text-amber-700 dark:text-amber-400" };
    if (row.requestStatus === "failed") return { text: "Update failed", tone: "text-red-600 dark:text-red-400" };
    if (!row.hasV2) return { text: "Awaiting first analysis", tone: "text-muted-foreground" };
    if (expectedUnavailable) return { text: "Auto-recheck enabled", tone: "text-slate-500 dark:text-slate-400" };
    if (expired) return { text: "Snapshot stale", tone: "text-amber-700 dark:text-amber-400" };
    return { text: "Current", tone: "text-muted-foreground" };
  })();
  const shownMarketSignals = isUnavailable ? [] : row.marketSignals;
  const latestEvent = row.recentEvents[0] ?? null;
  const primarySignal = shownMarketSignals[0] ?? null;

  const dMove = dollarMove(row);
  const vwapDist = vwapDistance(row);
  const rangePos = rangePosition(row);
  const dVol = dollarVolume(row);
  const tier = rvolIntensityTier(row.rvol);

  const rvolStatus = (() => {
    const r = row.inputsQuality.rvol;
    if (row.rvol !== null) return null;
    if (r === "not_applicable_session") return "Not applicable";
    if (r === "no_baseline" || r === "baseline_invalid" || r === "baseline_incompatible") {
      return "RVOL pending";
    }
    if (row.requestStatus === "pending") return "RVOL pending";
    return "Unavailable";
  })();

  const earningsUrgent = earnings?.kind === "upcoming";

  return (
    <div
      className={cn(
        "border border-slate-200 dark:border-slate-700/80 rounded-md bg-white dark:bg-slate-900 overflow-hidden",
        "motion-safe:transition-shadow motion-safe:duration-150",
      )}
    >
      {/* COLLAPSED — mobile stacked / desktop aligned domains */}
      <div
        className={cn(
          tokens.rowPad,
          tokens.rowGap,
          "grid grid-cols-1",
          // Tablet: 2-col reflow without shrinking type below readable
          "md:grid-cols-2",
          // Desktop: aligned scan columns
          "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.95fr)_minmax(96px,0.65fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_auto]",
          "lg:items-center",
        )}
      >
        {/* 1. Identity */}
        <div className="min-w-0 flex items-start justify-between gap-2 lg:block">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to={`/stocks/${row.ticker.toLowerCase()}`}
                className={cn(
                  "font-semibold tracking-wide hover:underline text-slate-900 dark:text-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 rounded-sm",
                  tokens.tickerClass,
                )}
              >
                {row.ticker}
              </Link>
              <Badge variant="outline" className="text-[10px] h-5 font-normal border-slate-300 dark:border-slate-600">
                {sessionLabel(row.sessionType)}
              </Badge>
              {earnings && (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded border font-medium",
                    earningsUrgent
                      ? "bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                      : "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
                  )}
                >
                  {earnings.label}
                </span>
              )}
              {!earnings && latestEvent && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-900 border border-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-300 dark:border-cyan-800">
                  Catalyst
                </span>
              )}
            </div>
            {row.companyName && (
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 pr-2">
                {row.companyName}
              </div>
            )}
          </div>

          {/* Mobile primary expand */}
          <div className="flex items-center gap-1 shrink-0 lg:hidden">
            <Button
              size="sm"
              variant="outline"
              className={cn(tokens.controlSize, "p-0")}
              onClick={() => onRefresh(row.ticker)}
              disabled={isRefreshing}
              title="Refresh analysis"
              aria-label={`Refresh ${row.ticker}`}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={cn(tokens.controlSize, "p-0")}
              onClick={() => setExpanded((v) => !v)}
              title={expanded ? "Collapse" : "Expand"}
              aria-expanded={expanded}
              aria-label={expanded ? `Collapse ${row.ticker}` : `Expand ${row.ticker}`}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className={cn(tokens.controlSize, "p-0")}
              onClick={() => onRemove(row.ticker)}
              title="Remove from watchlist"
              aria-label={`Remove ${row.ticker}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* 2. Price action */}
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className={cn("font-semibold tabular-nums text-slate-900 dark:text-slate-50", tokens.priceClass)}>
              ${num(row.price)}
            </span>
            <span className={cn("tabular-nums font-medium", tokens.changeClass, changeColor)}>
              {change === null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
            </span>
            {tokens.showDollarMove && dMove !== null && (
              <span className={cn("text-xs tabular-nums", changeColor)}>
                {dMove >= 0 ? "+" : ""}${num(dMove)}
              </span>
            )}
          </div>
          {tokens.showSecondaryMeta && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] text-slate-500 dark:text-slate-400">
              {vwapDist ? (
                <span className="tabular-nums text-cyan-800 dark:text-cyan-300/90">
                  VWAP {vwapDist.dollars >= 0 ? "+" : ""}${num(vwapDist.dollars)} (
                  {vwapDist.pct >= 0 ? "+" : ""}
                  {vwapDist.pct.toFixed(2)}%)
                </span>
              ) : (
                <span>VWAP —</span>
              )}
              <RangeBar pos={rangePos} />
            </div>
          )}
        </div>

        {/* 3. Micro-chart — always on mobile stack; aligned on desktop */}
        <div className="min-w-0 w-full">
          <V2IntradayChart
            bars={row.intraday}
            height={tokens.chartH}
            vwap={row.keyLevels.vwap}
            priorClose={row.keyLevels.prior_close}
          />
        </div>

        {/* 4. Volume / RVOL */}
        <div className="min-w-0 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Vol</span>
            <span className="tabular-nums text-xs font-medium text-slate-800 dark:text-slate-100">
              {compactVol(row.volume)}
            </span>
          </div>
          {tokens.showSecondaryMeta && (
            <div className="text-[10px] text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
              $Vol {dVol === null ? "—" : compactVol(dVol)}
            </div>
          )}
          {row.rvol !== null ? (
            <div className="mt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500 dark:text-slate-400">RVOL</span>
                <span className="tabular-nums text-xs font-medium">{row.rvol.toFixed(2)}×</span>
              </div>
              {tokens.showRvolMeter && <RvolMeter rvol={row.rvol} tier={tier} />}
            </div>
          ) : (
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">{rvolStatus}</div>
          )}
        </div>

        {/* 5. Intelligence */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded font-medium",
                dir.className,
              )}
            >
              <DirIcon className="h-3 w-3" aria-hidden />
              {dir.label}
            </span>
            {primarySignal && tokens.showSecondaryMeta && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                {primarySignal.label}
              </span>
            )}
          </div>
          {tokens.showSecondaryMeta && (
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 truncate">
              {earnings
                ? earnings.label
                : latestEvent
                  ? latestEvent.title
                  : "No qualifying recent event"}
            </div>
          )}
          {tokens.showUpdatedLine && (
            <div className="flex items-center gap-2 mt-1 text-[10px] tabular-nums">
              {row.analyzedAt && (
                <span className="text-slate-500 dark:text-slate-400">
                  Updated {formatRelative(row.analyzedAt)}
                </span>
              )}
              <span className={statusLine.tone}>{statusLine.text}</span>
              {marketDataAge && (
                <span className="text-slate-400 dark:text-slate-500">{marketDataAge}</span>
              )}
            </div>
          )}
          {!tokens.showUpdatedLine && (statusLine.text !== "Current" || marketDataAge) && (
            <div className="flex flex-wrap items-center gap-x-2 mt-0.5 text-[10px]">
              {statusLine.text !== "Current" && (
                <span className={statusLine.tone}>{statusLine.text}</span>
              )}
              {marketDataAge && (
                <span className="text-slate-400 dark:text-slate-500">{marketDataAge}</span>
              )}
            </div>
          )}
        </div>

        {/* 6. Desktop controls */}
        <div className="hidden lg:flex flex-col gap-1 justify-end items-center">
          <Button
            size="sm"
            variant="outline"
            className={cn(tokens.controlSize, "p-0")}
            onClick={() => onRefresh(row.ticker)}
            disabled={isRefreshing}
            title="Refresh analysis"
            aria-label={`Refresh ${row.ticker}`}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn(tokens.controlSize, "p-0")}
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Collapse" : "Expand"}
            aria-expanded={expanded}
            aria-label={expanded ? `Collapse ${row.ticker}` : `Expand ${row.ticker}`}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn(tokens.controlSize, "p-0")}
            onClick={() => onRemove(row.ticker)}
            title="Remove from watchlist"
            aria-label={`Remove ${row.ticker}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* EXPANDED DRAWER — full width beneath row; no layout shift of siblings */}
      {expanded && (
        <div
          className={cn(
            "border-t border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950/80",
            tokens.drawerPad,
            "grid grid-cols-1 md:grid-cols-3",
            tokens.drawerGap,
            "text-sm",
          )}
        >
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Deterministic Market Signals
            </div>
            {shownMarketSignals.length === 0 ? (
              <div className="text-xs text-muted-foreground">No signals recorded</div>
            ) : (
              <ul className="space-y-1.5">
                {shownMarketSignals.map((s) => {
                  const cls =
                    s.direction === "bullish"
                      ? "text-emerald-600 dark:text-emerald-400"
                      : s.direction === "bearish"
                        ? "text-red-600 dark:text-red-400"
                        : "text-muted-foreground";
                  return (
                    <li key={s.signal_id} className="flex items-center justify-between gap-2 text-xs">
                      <span>{s.label}</span>
                      <span className={cn("text-[11px]", cls)}>{s.direction ?? "neutral"}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Verified Recent Event
            </div>
            {!latestEvent ? (
              <div className="text-xs text-muted-foreground">No qualifying recent event</div>
            ) : (
              <div>
                {latestEvent.source_url ? (
                  <a
                    href={latestEvent.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium hover:underline inline-flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 rounded-sm"
                  >
                    {latestEvent.title}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : (
                  <div className="text-sm font-medium">{latestEvent.title}</div>
                )}
                <div className="text-[11px] text-muted-foreground mt-1 tabular-nums">
                  {latestEvent.source_name} · {formatRelative(latestEvent.event_time)} · Provider reported
                </div>
              </div>
            )}
            {earnings && (
              <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700/60">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Upcoming / Recent Earnings
                </div>
                <div className="text-xs font-medium">{earnings.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {earnings.event.title} · Provider reported
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Objective Key Levels
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {(
                [
                  ["VWAP", row.keyLevels.vwap],
                  ["HOD", row.keyLevels.hod],
                  ["LOD", row.keyLevels.lod],
                  ["PM High", row.keyLevels.premarket_high],
                  ["PM Low", row.keyLevels.premarket_low],
                  ["Prior Close", row.keyLevels.prior_close],
                ] as const
              ).map(([label, v]) => (
                <div key={label} className="flex justify-between">
                  <dt className={cn("text-muted-foreground", label === "VWAP" && "text-cyan-800 dark:text-cyan-300/90")}>
                    {label}
                  </dt>
                  <dd className="tabular-nums">{v === null ? "—" : `$${num(v)}`}</dd>
                </div>
              ))}
            </dl>
            {row.rvol === null && (
              <div className="text-[11px] text-muted-foreground mt-2">
                {rvolStatus === "Not applicable"
                  ? "RVOL not applicable this session"
                  : rvolStatus === "RVOL pending"
                    ? "RVOL pending"
                    : "RVOL unavailable"}
              </div>
            )}
          </div>

          {(isUnavailable || row.requestStatus === "failed" || row.failureReason) && (
            <div className="md:col-span-3 pt-2 border-t border-slate-200 dark:border-slate-700/60">
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/60 rounded-sm"
                onClick={() => setShowDiag((v) => !v)}
              >
                {showDiag ? "Hide provider diagnostics" : "Show provider diagnostics"}
              </button>
              {showDiag && (
                <div
                  className={cn(
                    "mt-2 text-xs space-y-1",
                    providerFailed
                      ? "text-red-700 dark:text-red-400"
                      : "text-slate-600 dark:text-slate-300",
                  )}
                >
                  {row.failureReason && <p>{humanFailureReason(row.failureReason)}</p>}
                  {unavailableSecondary && <p>{unavailableSecondary}</p>}
                  {expectedUnavailable && !providerFailed && <p>Auto-recheck enabled</p>}
                  {row.requestError && <p>{row.requestError}</p>}
                  {isUnavailable && !row.failureReason && (
                    <p>{humanFailureReason(row.failureReason)}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Workflow actions — primary on mobile live in drawer when dense */}
          <div className="md:col-span-3 flex flex-wrap gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/60">
            <Button asChild size="sm" variant="outline" className="h-8 text-xs min-h-8">
              <Link to={`/dashboard/ai?symbol=${row.ticker}`}>
                <BrainCircuit className="h-3.5 w-3.5 mr-1.5" /> AI Analyst
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-8 text-xs min-h-8">
              <Link to={`/dashboard/catalyst?symbol=${row.ticker}`}>
                <Flame className="h-3.5 w-3.5 mr-1.5" /> Catalyst
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-8 text-xs min-h-8">
              <Link to={`/dashboard/journal?symbol=${row.ticker}`}>
                <BookOpen className="h-3.5 w-3.5 mr-1.5" /> Journal
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-8 text-xs min-h-8">
              <Link to={`/chart/${row.ticker}`}>
                <LineChart className="h-3.5 w-3.5 mr-1.5" /> Chart
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="h-8 text-xs min-h-8">
              <Link to={`/stocks/${row.ticker.toLowerCase()}`}>
                <BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Stock page
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
