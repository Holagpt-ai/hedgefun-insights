import { Link } from "react-router-dom";
import { useState } from "react";
import type { V2Row } from "@/hooks/useWatchlistV2";
import { humanFailureReason, isExpired } from "@/lib/watchlist-v2/parsers";
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
} from "lucide-react";

interface Props {
  row: V2Row;
  onRefresh: (t: string) => void;
  onRemove: (t: string) => void;
  isRefreshing: boolean;
}

const num = (n: number | null, digits = 2) =>
  n === null ? "—" : n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

const compactVol = (n: number | null) => {
  if (n === null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
};

const sessionLabel = (s: V2Row["sessionType"]) =>
  s === "premarket" ? "Pre-market" : s === "postclose" ? "Post-close" : "Regular hours";

const directionBadge = (d: V2Row["direction"]) => {
  const map: Record<V2Row["direction"], { label: string; className: string }> = {
    bullish: { label: "Bullish", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
    bearish: { label: "Bearish", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
    neutral: { label: "Neutral", className: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200" },
    data_unavailable: { label: "Data Unavailable", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300" },
  };
  return map[d];
};

const rvolBadge = (c: V2Row["rvolClass"]) => {
  if (!c) return null;
  const map = {
    normal: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    elevated: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    unusual: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  } as const;
  const label = c === "normal" ? "Normal" : c === "elevated" ? "Elevated" : "Unusual";
  return { label, className: map[c] };
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

export function WatchlistRowV2({ row, onRefresh, onRemove, isRefreshing }: Props) {
  const [expanded, setExpanded] = useState(false);
  const dir = directionBadge(row.direction);
  const rvol = rvolBadge(row.rvolClass);
  const expired = row.hasV2 && isExpired(row.validThrough);
  const freshness = !row.hasV2 ? "" : expired ? "Update pending" : "Current";
  const change = row.changePct;
  const changeColor =
    change === null ? "text-muted-foreground" : change >= 0 ? "text-emerald-600" : "text-red-600";

  const latestEvent = row.recentEvents[0] ?? null;

  const rvolUnavailableReason = (() => {
    const r = row.inputsQuality.rvol;
    if (r === "no_baseline") return "RVOL baseline unavailable";
    if (r === "baseline_invalid") return "RVOL baseline invalid";
    if (r === "baseline_incompatible") return "RVOL baseline incompatible";
    if (r === "not_applicable_session") return "RVOL not applicable this session";
    return "RVOL unavailable";
  })();

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* HEADER ROW */}
      <div className="p-4 grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-4 items-center">
        {/* Stock */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to={`/stocks/${row.ticker}`}
              className="font-semibold text-base hover:underline"
            >
              {row.ticker}
            </Link>
            <Badge variant="outline" className="text-[10px]">{sessionLabel(row.sessionType)}</Badge>
            {row.hasV2 && (
              <span
                className={`text-[10px] ${expired ? "text-amber-600" : "text-muted-foreground"}`}
              >
                {freshness}
              </span>
            )}
          </div>
          {row.companyName && (
            <div className="text-xs text-muted-foreground truncate">{row.companyName}</div>
          )}
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-lg font-semibold tabular-nums">${num(row.price)}</span>
            <span className={`text-sm tabular-nums ${changeColor}`}>
              {change === null ? "—" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
            </span>
          </div>
          {row.analyzedAt && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Analyzed {formatRelative(row.analyzedAt)}
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="min-w-0">
          <V2IntradayChart bars={row.intraday} />
        </div>

        {/* Volume / RVOL */}
        <div className="min-w-0 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">Vol</span>
            <span className="tabular-nums">{compactVol(row.volume)}</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            {row.rvol !== null ? (
              <>
                <span className="text-muted-foreground text-xs">RVOL</span>
                <span className="tabular-nums">{row.rvol.toFixed(2)}×</span>
                {rvol && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${rvol.className}`}>
                    {rvol.label}
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs text-muted-foreground">{rvolUnavailableReason}</span>
            )}
          </div>
          <div className="text-[10px] text-muted-foreground mt-1">
            Market feed is 15-minute delayed
          </div>
        </div>

        {/* AI Read */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded ${dir.className}`}>{dir.label}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {row.direction === "data_unavailable"
              ? humanFailureReason(row.failureReason)
              : row.explanation || "—"}
          </p>
          {row.requestStatus === "pending" && (
            <div className="text-[10px] text-amber-600 mt-1">Analysis pending</div>
          )}
          {row.requestStatus === "failed" && (
            <div className="text-[10px] text-red-600 mt-1">
              Update failed{row.requestError ? ` — ${row.requestError}` : ""}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex md:flex-col gap-1 justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRefresh(row.ticker)}
            disabled={isRefreshing}
            title="Refresh V2 analysis"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onRemove(row.ticker)}
            title="Remove from watchlist"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* EXPANDED EVIDENCE */}
      {expanded && (
        <div className="border-t bg-muted/30 p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          {/* Market Signals */}
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
              Market Signals
            </div>
            {row.marketSignals.length === 0 ? (
              <div className="text-xs text-muted-foreground">No signals recorded.</div>
            ) : (
              <ul className="space-y-1.5">
                {row.marketSignals.map((s) => {
                  const cls =
                    s.direction === "bullish"
                      ? "text-emerald-600"
                      : s.direction === "bearish"
                      ? "text-red-600"
                      : "text-muted-foreground";
                  return (
                    <li key={s.signal_id} className="flex items-center justify-between gap-2">
                      <span>{s.label}</span>
                      <span className={`text-[11px] ${cls}`}>
                        {s.direction ?? "neutral"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {row.driverIds.length > 0 && (
              <div className="mt-3">
                <div className="text-[11px] uppercase text-muted-foreground mb-1">
                  AI Read evidence
                </div>
                <div className="flex flex-wrap gap-1">
                  {row.driverIds.map((d) => (
                    <span
                      key={d}
                      className="text-[11px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Recent Event */}
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
              Verified Recent Event
            </div>
            {!latestEvent ? (
              <div className="text-xs text-muted-foreground">No qualifying recent event.</div>
            ) : (
              <div>
                {latestEvent.source_url ? (
                  <a
                    href={latestEvent.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium hover:underline inline-flex items-center gap-1"
                  >
                    {latestEvent.title}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : (
                  <div className="text-sm font-medium">{latestEvent.title}</div>
                )}
                <div className="text-[11px] text-muted-foreground mt-1">
                  {latestEvent.source_name} · {formatRelative(latestEvent.event_time)} · Provider reported
                </div>
              </div>
            )}
          </div>

          {/* Key Levels */}
          <div>
            <div className="text-xs font-semibold uppercase text-muted-foreground mb-2">
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
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="tabular-nums">{v === null ? "—" : `$${num(v)}`}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Row actions */}
          <div className="md:col-span-3 flex flex-wrap gap-2 pt-2 border-t">
            <Button asChild size="sm" variant="outline">
              <Link to={`/dashboard/ai?symbol=${row.ticker}`}>
                <BrainCircuit className="h-3.5 w-3.5 mr-1.5" /> AI Analyst
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/dashboard/catalyst?symbol=${row.ticker}`}>
                <Flame className="h-3.5 w-3.5 mr-1.5" /> Catalyst
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/dashboard/journal?symbol=${row.ticker}`}>
                <BookOpen className="h-3.5 w-3.5 mr-1.5" /> Journal
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/chart/${row.ticker}`}>
                <LineChart className="h-3.5 w-3.5 mr-1.5" /> Chart
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to={`/stocks/${row.ticker}`}>
                <BarChart3 className="h-3.5 w-3.5 mr-1.5" /> Stock page
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
