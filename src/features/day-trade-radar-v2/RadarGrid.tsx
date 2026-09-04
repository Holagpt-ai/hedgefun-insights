import { Link } from "react-router-dom";
import { Plus, Check, Loader2, Newspaper, Sparkles, BookOpen } from "lucide-react";
import { useAddToWatchlist } from "@/hooks/useAddToWatchlist";
import { useCatalystEnrichmentForSymbols } from "@/hooks/useCatalystEnrichmentForSymbols";
import { catalystSymbolHref } from "@/lib/catalyst/enrichment";
import { EVENT_TYPE_LABEL, normalizeSymbol } from "@/lib/catalyst/parsers";
import { isRadarCapabilityEnabled } from "./radar-capabilities";
import {
  RADAR_ACTIONS_STICKY_CELL_CLASS,
  RADAR_ACTIONS_STICKY_HEADER_CLASS,
  RADAR_GRID_COLUMNS,
} from "./radar-grid-columns";
import {
  formatHodDistance,
  formatRadarDayRange,
  formatRadarMultiplier,
  formatRadarPercent,
  formatRadarPrice,
  formatRadarVolume,
  isRadarRowAccessible,
  moveClass,
  radarSignalClass,
  volumeRatioClass,
} from "./radar-metrics";
import type { RadarRankedRow } from "./types";
import { useMemo } from "react";
import { LegacyConfirmedBadge } from "./LegacyConfirmedBadge";

interface RadarGridProps {
  rows: RadarRankedRow[];
  selectedSymbol: string | null;
  isPro: boolean;
  freeRowLimit: number;
  onSelect: (row: RadarRankedRow) => void;
}

function CatalystCell({
  symbol,
  pending,
  error,
  entry,
}: {
  symbol: string;
  pending: boolean;
  error: boolean;
  entry: { event: { title?: string | null; event_type: string }; kind: string } | undefined;
}) {
  if (pending) {
    return <span className="text-muted-foreground text-xs">Catalyst check pending</span>;
  }
  if (error) {
    return <span className="text-muted-foreground text-xs">Catalyst unavailable</span>;
  }
  if (!entry) {
    return <span className="text-muted-foreground text-xs">No confirmed catalyst</span>;
  }
  const label =
    EVENT_TYPE_LABEL[entry.event.event_type as keyof typeof EVENT_TYPE_LABEL] ??
    "Catalyst";
  const href =
    catalystSymbolHref(symbol) ??
    `/dashboard/catalyst?symbol=${encodeURIComponent(symbol)}`;
  return (
    <Link
      to={href}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex flex-col items-start gap-0.5 max-w-[160px] hover:underline"
      title={entry.event.title ?? label}
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {isRadarCapabilityEnabled("pressReleaseClassification") ? "PR" : "Catalyst"} · {label}
      </span>
      <span className="text-[12px] text-foreground truncate max-w-full">
        {entry.event.title ?? label}
      </span>
    </Link>
  );
}

export function RadarGrid({
  rows,
  selectedSymbol,
  isPro,
  freeRowLimit,
  onSelect,
}: RadarGridProps) {
  const { add: addToWatchlist, isAdded, pendingSymbol } = useAddToWatchlist();

  const symbols = useMemo(() => {
    const out: string[] = [];
    for (const r of rows) {
      if (!isRadarRowAccessible(r.rank, isPro, freeRowLimit)) continue;
      const s = normalizeSymbol(r.symbol);
      if (s) out.push(s);
    }
    return out;
  }, [rows, isPro, freeRowLimit]);

  const {
    data: catalystMap,
    isPending: catalystPending,
    isFetching: catalystFetching,
    isError: catalystError,
  } = useCatalystEnrichmentForSymbols(symbols);

  const catalystCheckPending =
    symbols.length > 0 && (catalystPending || (catalystFetching && !catalystMap));

  return (
    <div className="relative rounded-lg border border-border overflow-hidden bg-card hidden md:block min-w-0">
      <div className="overflow-x-auto">
      <table className="w-full table-fixed text-[12px] min-w-[960px]">
        <colgroup>
          <col className="w-[44px]" />
          <col className="w-[18%]" />
          <col className="w-[11%]" />
          <col className="w-[11%]" />
          <col className="w-[14%]" />
          <col className="w-[9%]" />
          <col className="w-[12%]" />
          <col className="w-[14%]" />
          <col className="w-[160px]" />
        </colgroup>
        <thead className="bg-muted">
          <tr>
            {RADAR_GRID_COLUMNS.map((label) => (
              <th
                key={label}
                className={`px-2 py-2 font-semibold text-[10px] uppercase tracking-wide text-muted-foreground ${
                  ["#", "Symbol", "Signal", "Catalyst", "Actions"].includes(label)
                    ? "text-left"
                    : "text-right"
                } ${label === "Actions" ? RADAR_ACTIONS_STICKY_HEADER_CLASS : ""}`}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const accessible = isRadarRowAccessible(row.rank, isPro, freeRowLimit);
            const selected = selectedSymbol === row.symbol;
            const isLeader = row.rank === 1;
            const sym = row.symbol;
            const company = row.company_name?.trim() || sym;
            const already = isAdded(sym);
            const pending = pendingSymbol === sym;
            const entry = catalystMap?.get(sym);

            return (
              <tr
                key={`${row.tab_id}-${row.symbol}`}
                data-selected={selected ? "true" : undefined}
                data-leader={isLeader && accessible ? "true" : undefined}
                onClick={() => {
                  if (accessible) onSelect(row);
                }}
                className={`group border-t border-border transition-colors ${
                  !accessible
                    ? "blur-sm select-none pointer-events-none"
                    : "cursor-pointer hover:bg-muted/40"
                } ${selected ? "bg-accent-blue-light" : ""} ${
                  isLeader && accessible && !selected ? "bg-muted" : ""
                }`}
              >
                <td className="px-2 py-2 tabular-nums font-semibold text-muted-foreground">
                  #{row.rank}
                </td>
                <td className="px-2 py-2 min-w-0">
                  <Link
                    to={`/stocks/${sym}`}
                    onClick={(e) => e.stopPropagation()}
                    className="font-semibold text-accent-blue hover:underline"
                  >
                    {sym}
                  </Link>
                  <div className="text-[11px] text-muted-foreground truncate">{company}</div>
                  <LegacyConfirmedBadge confirmed={row.legacy_confirmed} />
                </td>
                <td className="px-2 py-2">
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide ${radarSignalClass(row.signal)}`}
                  >
                    {row.signal}
                  </span>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <div>{formatRadarPrice(row.price)}</div>
                  <div className={moveClass(row.change_percent)}>
                    {formatRadarPercent(row.change_percent)}
                  </div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <div className="whitespace-nowrap">
                    {formatRadarDayRange(row.day_low, row.day_high)}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    HOD {formatHodDistance(row.hod_distance_percent)}
                  </div>
                </td>
                <td className="px-2 py-2 text-right tabular-nums font-medium">
                  {formatRadarVolume(row.volume)}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  <div>{formatRadarVolume(row.prior_session_volume)}</div>
                  <div className={volumeRatioClass(row.volume_ratio_prior_session)}>
                    {formatRadarMultiplier(row.volume_ratio_prior_session)}
                  </div>
                </td>
                <td className="px-2 py-2 min-w-0">
                  {accessible ? (
                    <CatalystCell
                      symbol={sym}
                      pending={catalystCheckPending}
                      error={!!catalystError}
                      entry={entry}
                    />
                  ) : (
                    "—"
                  )}
                </td>
                <td
                  className={`px-2 py-2 ${RADAR_ACTIONS_STICKY_CELL_CLASS} ${
                    selected
                      ? "bg-accent-blue-light group-hover:bg-accent-blue-light"
                      : isLeader && accessible
                        ? "bg-muted group-hover:bg-muted"
                        : `bg-card${accessible ? " group-hover:bg-muted" : ""}`
                  }`}
                >
                  {accessible && (
                    <div className="inline-flex items-center gap-0.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!already && !pending) addToWatchlist(sym);
                        }}
                        disabled={already || pending}
                        aria-label={
                          already ? `${sym} is in watchlist` : `Add ${sym} to watchlist`
                        }
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-70"
                      >
                        {pending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : already ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <Plus className="h-4 w-4" />
                        )}
                      </button>
                      <Link
                        to={
                          catalystSymbolHref(sym) ??
                          `/dashboard/catalyst?symbol=${encodeURIComponent(sym)}`
                        }
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`View catalysts for ${sym}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Newspaper className="h-4 w-4" />
                      </Link>
                      <Link
                        to={`/dashboard/ai?symbol=${encodeURIComponent(sym)}`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Ask AI Analyst about ${sym}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <Sparkles className="h-4 w-4" />
                      </Link>
                      <Link
                        to={`/dashboard/journal?symbol=${encodeURIComponent(sym)}`}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Open journal for ${sym}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                      >
                        <BookOpen className="h-4 w-4" />
                      </Link>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </div>
  );
}
